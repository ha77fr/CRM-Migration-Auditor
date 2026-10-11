from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.domain.contracts import AuditContract
from app.domain.csv_reader import read_csv
from app.domain.engine import compare


def contract(**pair_overrides):
    return AuditContract(
        source_key="id",
        target_key="id",
        parent_pairs={
            "companies": {
                "source_dataset_id": uuid4(),
                "target_dataset_id": uuid4(),
                "source_key": "id",
                "target_key": "id",
                **pair_overrides,
            }
        },
        relationships=[{"source": "company", "target": "company", "parent_pair": "companies"}],
    )


def run(
    target_link="A",
    source_parents="A\nB\n",
    target_parents="A\nB\n",
    rules=None,
    source_link="A",
    max_findings=100,
):
    rules = rules or contract()
    return compare(
        read_csv(f"id,company\n1,{source_link}\n".encode(), 100),
        read_csv(f"id,company\n1,{target_link}\n".encode(), 100),
        rules,
        max_findings,
        {
            "companies": (
                read_csv(f"id\n{source_parents}".encode(), 100),
                read_csv(f"id\n{target_parents}".encode(), 100),
            )
        },
    )


def test_relationship_only_crosswalk_checks_identity_not_only_existence():
    rules = contract(key_map={"A": "X", "B": "Y"})
    passed = run("X", target_parents="X\nY\n", rules=rules)
    assert passed.verdict == "passed"
    assert passed.compared_fields == 0
    assert passed.compared_relationships == 1
    failed = run("Y", target_parents="X\nY\n", rules=rules)
    assert failed.verdict == "failed"
    assert failed.finding_counts == {"relationship_mismatch": 1}
    assert failed.findings[0].expected == "X"
    assert failed.findings[0].actual == "Y"
    assert failed.findings[0].dataset_pair == "companies"
    assert run("Y", source_parents="B\nA\n", target_parents="Y\nX\n", rules=rules) == failed


@pytest.mark.parametrize(
    "kwargs,code",
    [
        ({"source_parents": "B\n"}, "missing_parent"),
        ({"target_parents": "B\n"}, "missing_parent"),
        ({"target_link": "B", "target_parents": "B\n"}, "missing_parent"),
        ({"source_parents": "A\nA\nB\n"}, "duplicate_key"),
        ({"target_parents": "A\nA\nB\n"}, "duplicate_key"),
        ({"target_link": ""}, "missing_parent"),
    ],
)
def test_uncertain_parents_never_pass(kwargs, code):
    report = run(**kwargs)
    assert report.verdict == "not_verified"
    assert code in report.finding_counts
    assert report.compared_relationships == 0


def test_crosswalk_identity_collision_and_merges_are_not_guessed():
    report = run("B", rules=contract(key_map={"A": "B"}))
    assert report.verdict == "not_verified"
    assert report.finding_counts == {"ambiguous_mapping": 1}
    assert report.compared_relationships == 0
    with pytest.raises(ValidationError):
        contract(key_map={"A": "X", "B": "X"})


def test_optional_links_require_both_empty_and_explicit_permission():
    assert run(source_link="", target_link="").verdict == "not_verified"
    rules = contract()
    rules.relationships[0].allow_empty = True
    assert run(source_link="", target_link="", rules=rules).verdict == "passed"
    assert run(source_link="", target_link="A", rules=rules).verdict == "not_verified"
    assert run(source_link="A", target_link="", rules=rules).verdict == "not_verified"


def test_parent_uncertainty_survives_report_truncation():
    report = run(source_parents="A\nA\nB\n", target_parents="A\nA\nB\n", max_findings=1)
    assert report.verdict == "not_verified"
    assert report.finding_counts == {"duplicate_key": 2}
    assert report.findings_truncated
    assert len(report.findings) == 1


@pytest.mark.parametrize(
    "change",
    [
        {"relationships": [{"source": "company", "target": "company", "parent_pair": "unknown"}]},
        {"relationships": []},
        {"parent_pairs": {"unsafe:name": {}}},
    ],
)
def test_contract_rejects_unknown_unused_and_invalid_parent_names(change):
    payload = contract().model_dump()
    payload.update(change)
    with pytest.raises(ValidationError):
        AuditContract.model_validate(payload)
