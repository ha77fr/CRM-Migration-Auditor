from typing import Literal

from pydantic import BaseModel, Field

FindingCode = Literal[
    "missing_record",
    "unexpected_record",
    "duplicate_key",
    "empty_key",
    "field_mismatch",
    "invalid_value",
    "ambiguous_mapping",
    "empty_dataset",
    "relationship_mismatch",
    "missing_parent",
]


class Finding(BaseModel):
    code: FindingCode
    side: Literal["source", "target"] | None = None
    record_key: str | None = None
    field: str | None = None
    expected: str | None = None
    actual: str | None = None
    # One-based DATA record index, excluding the header and skipped blank records.
    record_number: int | None = None
    relationship: str | None = None
    dataset_pair: str | None = None


class AuditReport(BaseModel):
    engine_version: str = "0.2.0"
    verdict: Literal["passed", "failed", "not_verified"]
    source_rows: int
    target_rows: int
    matched_records: int
    compared_fields: int
    compared_relationships: int = 0
    finding_counts: dict[str, int]
    findings: list[Finding]
    findings_truncated: bool
    scope: str = "Selected fields and exact record IDs in these two uploaded snapshots only."
    input_sha256: dict[str, str] = Field(default_factory=dict)
