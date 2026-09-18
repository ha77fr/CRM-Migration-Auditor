import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain.contracts import AuditContract
from app.domain.csv_reader import InvalidDataset, read_csv
from app.domain.engine import compare

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def run(source, target, **overrides):
    contract = AuditContract.model_validate(
        {
            "source_key": "id",
            "target_key": "id",
            "fields": [{"source": "value", "target": "value"}],
            **overrides,
        }
    )
    return compare(read_csv(source.encode(), 100), read_csv(target.encode(), 100), contract, 100)


def test_synthetic_migration_and_input_order_independence():
    source = read_csv((EXAMPLES / "source.csv").read_bytes(), 100)
    target = read_csv((EXAMPLES / "target.csv").read_bytes(), 100)
    contract = AuditContract.model_validate(json.loads((EXAMPLES / "contract.json").read_text()))
    report = compare(source, target, contract, 100)
    assert report.verdict == "failed"
    assert report.finding_counts == {
        "field_mismatch": 1,
        "missing_record": 1,
        "unexpected_record": 1,
    }
    assert report.matched_records == 2
    assert report.compared_fields == 6
    source.rows.reverse()
    assert compare(source, target, contract, 100) == report


def test_ids_preserve_leading_zeros():
    report = run("id,value\n001,A\n", "id,value\n1,A\n")
    assert report.finding_counts == {"missing_record": 1, "unexpected_record": 1}


def test_explicit_key_mapping_and_normalization():
    report = run(
        "id,value\n001,  WON  \n",
        "id,value\nHS-1,closed_won\n",
        key_map={"001": "HS-1"},
        fields=[
            {
                "source": "value",
                "target": "value",
                "normalizers": ["strip", "casefold"],
                "value_map": {"won": "closed_won"},
            }
        ],
    )
    assert report.verdict == "passed"


def test_mapped_id_collision_with_identity_id_is_uncertain():
    report = run("id,value\n1,A\n2,A\n", "id,value\n2,A\n", key_map={"1": "2"})
    assert report.verdict == "not_verified"
    assert report.finding_counts == {"ambiguous_mapping": 1}
    assert report.matched_records == 0


def test_duplicate_and_blank_keys_are_not_silently_compared():
    report = run("id,value\n1,A\n1,B\n,C\n", "id,value\n1,A\n")
    assert report.verdict == "not_verified"
    assert report.finding_counts == {"empty_key": 1, "duplicate_key": 1}
    assert report.compared_fields == 0


@pytest.mark.parametrize(
    "actual,verdict",
    [
        ("1.01", "passed"),
        ("1.02", "failed"),
        ("NaN", "not_verified"),
        ("", "not_verified"),
        ("1e999999999", "not_verified"),
    ],
)
def test_decimal_tolerance_and_invalid_values(actual, verdict):
    report = run(
        "id,value\n1,1.00\n",
        f"id,value\n1,{actual}\n",
        fields=[
            {
                "source": "value",
                "target": "value",
                "comparison": "decimal",
                "tolerance": "0.01",
            }
        ],
    )
    assert report.verdict == verdict


def test_empty_snapshots_are_not_a_pass():
    report = run("id,value\n", "id,value\n")
    assert report.verdict == "not_verified"
    assert report.finding_counts["empty_dataset"] == 2


def test_truncation_preserves_total_counts_and_uncertainty():
    contract = AuditContract(
        source_key="id", target_key="id", fields=[{"source": "value", "target": "value"}]
    )
    report = compare(
        read_csv(b"id,value\n1,A\n2,B\n3,C\n", 100),
        read_csv(b"id,value\n1,X\n2,Y\n3,Z\n", 100),
        contract,
        1,
    )
    assert report.finding_counts == {"field_mismatch": 3}
    assert len(report.findings) == 1
    assert report.findings_truncated
    assert report.verdict == "failed"


@pytest.mark.parametrize(
    "content",
    [
        b"",
        b"id,id\n1,2",
        b"id,v\n1,2,3",
        b"id,v\n\xff,A",
        b'id,v\n1,"unclosed',
        b"id,\n1,A",
        b"id,v\n1,\x00",
    ],
)
def test_rejects_malformed_csv(content):
    with pytest.raises(InvalidDataset):
        read_csv(content, 100)


def test_bom_quotes_multiline_fields_and_row_limit():
    table = read_csv(b'\xef\xbb\xbfid,value\r\n001,"Hello,\nworld"\r\n', 1)
    assert table.rows == [{"id": "001", "value": "Hello,\nworld"}]
    with pytest.raises(InvalidDataset, match="row limit"):
        read_csv(b"id,v\n1,A\n2,B\n", 1)


def test_rejects_missing_columns_and_many_to_one_mapping():
    with pytest.raises(ValueError, match="absent"):
        run("id,other\n1,A", "id,value\n1,A")
    with pytest.raises(ValidationError, match="one-to-one"):
        AuditContract(
            source_key="id",
            target_key="id",
            key_map={"1": "3", "2": "3"},
            fields=[{"source": "value", "target": "value"}],
        )


def test_exact_whitespace_headers_remain_addressable():
    contract = AuditContract(
        source_key=" id ",
        target_key=" id ",
        fields=[{"source": " value ", "target": " value "}],
    )
    report = compare(
        read_csv(b" id , value \n001,A\n", 100),
        read_csv(b" id , value \n001,A\n", 100),
        contract,
        100,
    )
    assert report.verdict == "passed"
    assert report.compared_fields == 1


@pytest.mark.parametrize("value", [" 1 ", "1_0", "\u0661"])
def test_decimal_syntax_does_not_implicitly_normalize(value):
    report = run(
        f"id,value\n1,{value}\n",
        "id,value\n1,1\n",
        fields=[{"source": "value", "target": "value", "comparison": "decimal"}],
    )
    assert report.verdict == "not_verified"
    assert report.finding_counts == {"invalid_value": 1}


def test_decimal_whitespace_requires_explicit_strip():
    report = run(
        "id,value\n1, 1.0 \n",
        "id,value\n1,1\n",
        fields=[
            {
                "source": "value",
                "target": "value",
                "comparison": "decimal",
                "normalizers": ["strip"],
            }
        ],
    )
    assert report.verdict == "passed"
