import re
from collections import Counter, defaultdict
from decimal import Decimal, DecimalException, InvalidOperation, localcontext

from app.domain.contracts import AuditContract, FieldRule
from app.domain.csv_reader import Table
from app.domain.reports import AuditReport, Finding

UNCERTAIN = {
    "duplicate_key",
    "empty_key",
    "invalid_value",
    "ambiguous_mapping",
    "empty_dataset",
    "missing_parent",
}
DECIMAL_PATTERN = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")


def decimal_value(value: str) -> Decimal:
    """Bound numeric input and reserve enough precision for exact subtraction."""
    if len(value) > 100 or DECIMAL_PATTERN.fullmatch(value) is None:
        raise InvalidOperation
    number = Decimal(value)
    if not number.is_finite():
        raise InvalidOperation
    parts = number.as_tuple()
    if len(parts.digits) > 38 or abs(parts.exponent) > 18:
        raise InvalidOperation
    return number


def normalize(value: str, rule: FieldRule) -> str:
    for operation in rule.normalizers:
        if operation == "strip":
            value = value.strip()
        elif operation == "casefold":
            value = value.casefold()
    return value


def compare(
    source: Table,
    target: Table,
    contract: AuditContract,
    max_findings: int,
    parent_tables: dict[str, tuple[Table, Table]] | None = None,
) -> AuditReport:
    """Deterministic and side-effect free. Runtime/memory are bounded by admitted input sizes.

    Duplicate/blank/ambiguous keys are never guessed. Findings may be capped, but
    counts and the verdict always cover the whole admitted dataset.
    """
    contract.validate_headers(source.headers, target.headers)
    parent_tables = parent_tables or {}
    if set(parent_tables) != set(contract.parent_pairs):
        raise ValueError("Parent tables must match the contract's parent pairs")
    counts: Counter[str] = Counter()
    findings: list[Finding] = []

    def add(code, **details):
        counts[code] += 1
        if len(findings) < max_findings:
            # Bound evidence sizes; original values remain in the immutable input snapshot.
            bounded = {
                key: value[:500] + " [truncated]"
                if isinstance(value, str) and len(value) > 500
                else value
                for key, value in details.items()
            }
            findings.append(Finding(code=code, **bounded))

    def index(table: Table, key_column: str, side: str, dataset_pair: str | None = None):
        groups: dict[str, list[tuple[int, dict[str, str]]]] = defaultdict(list)
        if not table.rows:
            add("empty_dataset", side=side, dataset_pair=dataset_pair)
        for number, row in enumerate(table.rows, start=1):
            key = row[key_column]
            if not key.strip():
                add("empty_key", side=side, record_number=number, dataset_pair=dataset_pair)
                continue
            groups[key].append((number, row))
        for key in sorted(groups):
            if len(groups[key]) > 1:
                add(
                    "duplicate_key",
                    side=side,
                    record_key=key,
                    actual=str(len(groups[key])),
                    dataset_pair=dataset_pair,
                )
        return groups

    left = index(source, contract.source_key, "source")
    right = index(target, contract.target_key, "target")
    destinations: dict[str, list[str]] = defaultdict(list)
    for source_id in left:
        destinations[contract.key_map.get(source_id, source_id)].append(source_id)
    ambiguous = {key for key, origins in destinations.items() if len(origins) > 1}
    for key in sorted(ambiguous):
        add("ambiguous_mapping", side="target", record_key=key)

    parents = {}
    for name in sorted(contract.parent_pairs):
        pair = contract.parent_pairs[name]
        parent_source, parent_target = parent_tables[name]
        if (
            pair.source_key not in parent_source.headers
            or pair.target_key not in parent_target.headers
        ):
            raise ValueError("A parent key is absent from the selected dataset headers")
        source_index = index(parent_source, pair.source_key, "source", name)
        target_index = index(parent_target, pair.target_key, "target", name)
        origins: dict[str, list[str]] = defaultdict(list)
        for key in source_index:
            origins[pair.key_map.get(key, key)].append(key)
        collisions = {key for key, keys in origins.items() if len(keys) > 1}
        for key in sorted(collisions):
            add("ambiguous_mapping", side="target", record_key=key, dataset_pair=name)
        parents[name] = source_index, target_index, collisions
    matched = checked = checked_relationships = 0
    for source_id in sorted(left):
        target_id = contract.key_map.get(source_id, source_id)
        if len(left[source_id]) != 1 or target_id in ambiguous:
            continue
        if target_id not in right:
            add("missing_record", side="target", record_key=source_id, expected=target_id)
            continue
        if len(right[target_id]) != 1:
            continue
        matched += 1
        _, source_row = left[source_id][0]
        target_number, target_row = right[target_id][0]
        for rule in contract.fields:
            expected = normalize(source_row[rule.source], rule)
            expected = normalize(rule.value_map.get(expected, expected), rule)
            actual = normalize(target_row[rule.target], rule)
            if rule.comparison == "decimal":
                try:
                    expected_number, actual_number = decimal_value(expected), decimal_value(actual)
                    # Keep exact admitted arithmetic independent of the caller's decimal context.
                    with localcontext(prec=100, Emax=100, Emin=-100, clamp=0):
                        equal = abs(expected_number - actual_number) <= rule.tolerance
                except DecimalException:
                    add(
                        "invalid_value",
                        record_key=source_id,
                        field=rule.target,
                        expected=expected,
                        actual=actual,
                        record_number=target_number,
                    )
                    continue
            else:
                equal = expected == actual
            checked += 1
            if not equal:
                add(
                    "field_mismatch",
                    side="target",
                    record_key=source_id,
                    field=rule.target,
                    expected=expected,
                    actual=actual,
                    record_number=target_number,
                )
        for rule in contract.relationships:
            source_parent = source_row[rule.source]
            target_parent = target_row[rule.target]
            details = {
                "record_key": source_id,
                "field": rule.target,
                "relationship": rule.target,
                "dataset_pair": rule.parent_pair,
                "record_number": target_number,
            }
            if source_parent == "" and target_parent == "" and rule.allow_empty:
                checked_relationships += 1
                continue
            pair = contract.parent_pairs[rule.parent_pair]
            parent_source, parent_target, collisions = parents[rule.parent_pair]
            expected_parent = pair.key_map.get(source_parent, source_parent)
            missing = False
            for side, key, groups in (
                ("source", source_parent, parent_source),
                ("target", target_parent, parent_target),
            ):
                if not key.strip() or key not in groups:
                    add("missing_parent", side=side, actual=key, **details)
                    missing = True
            if missing:
                continue
            if (
                len(parent_source[source_parent]) != 1
                or len(parent_target[target_parent]) != 1
                or expected_parent in collisions
                or target_parent in collisions
            ):
                continue
            if expected_parent not in parent_target:
                add("missing_parent", side="target", expected=expected_parent, **details)
                continue
            if len(parent_target[expected_parent]) != 1:
                continue
            checked_relationships += 1
            if target_parent != expected_parent:
                add(
                    "relationship_mismatch",
                    side="target",
                    expected=expected_parent,
                    actual=target_parent,
                    **details,
                )

    for target_id in sorted(right):
        if target_id not in destinations and len(right[target_id]) == 1:
            add("unexpected_record", side="target", record_key=target_id)

    verdict = "not_verified" if UNCERTAIN.intersection(counts) else "failed" if counts else "passed"
    return AuditReport(
        verdict=verdict,
        source_rows=len(source.rows),
        target_rows=len(target.rows),
        matched_records=matched,
        compared_fields=checked,
        compared_relationships=checked_relationships,
        finding_counts=dict(counts),
        findings=findings,
        findings_truncated=sum(counts.values()) > len(findings),
        scope=(
            "Selected fields, exact record IDs, and declared parent relationships "
            "in these snapshots only."
            if contract.relationships
            else "Selected fields and exact record IDs in these two uploaded snapshots only."
        ),
    )
