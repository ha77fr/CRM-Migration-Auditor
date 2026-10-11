import csv
import io
import json
from collections.abc import Iterable, Mapping
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.dependencies import SessionDep, require_api_key
from app.api.routes import require_audit

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_api_key)])

_FINDING_COLUMNS = (
    "code",
    "side",
    "record_key",
    "field",
    "expected",
    "actual",
    "record_number",
)
_SUMMARY_KEYS = (
    "engine_version",
    "verdict",
    "source_rows",
    "target_rows",
    "matched_records",
    "compared_fields",
    "compared_relationships",
    "findings_truncated",
    "scope",
)

_ATTACHMENT_RESPONSE_HEADERS = {
    "Content-Disposition": {
        "description": "Attachment filename for the audit report.",
        "schema": {"type": "string"},
    },
    "Cache-Control": {
        "description": "Prevents storage of report data by shared or browser caches.",
        "schema": {"type": "string", "example": "no-store"},
    },
}


def _completed_report(session, project_id: UUID, audit_id: UUID) -> tuple[str, dict[str, Any]]:
    audit = require_audit(session, project_id, audit_id)
    if audit.status != "completed" or audit.report is None:
        raise HTTPException(409, "The report is available only after the audit completes")
    return audit.id, audit.report


def _attachment_headers(audit_id: str, suffix: str) -> dict[str, str]:
    return {
        "Content-Disposition": f'attachment; filename="audit-report-{audit_id}.{suffix}"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    }


def _json_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return str(value)


def _spreadsheet_safe(value: Any) -> str:
    text = _json_value(value)
    if text.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


def _finding_columns(findings: Iterable[Mapping[str, Any]]) -> tuple[str, ...]:
    keys = {key for finding in findings for key in finding}
    return _FINDING_COLUMNS + tuple(sorted(keys.difference(_FINDING_COLUMNS)))


def _csv_bytes(report: Mapping[str, Any]) -> bytes:
    findings = report.get("findings", [])
    columns = _finding_columns(findings)
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(("row_type", "key", "value", *columns))

    excluded = {"findings", "finding_counts", "input_sha256"}
    summary_keys = [key for key in _SUMMARY_KEYS if key in report]
    summary_keys.extend(sorted(set(report).difference(excluded, summary_keys)))
    padding = ("",) * len(columns)
    for key in summary_keys:
        writer.writerow(("summary", key, _spreadsheet_safe(report[key]), *padding))

    for code, count in sorted(report.get("finding_counts", {}).items()):
        writer.writerow(
            ("finding_count", _spreadsheet_safe(code), _spreadsheet_safe(count), *padding)
        )
    for side, digest in sorted(report.get("input_sha256", {}).items()):
        writer.writerow(
            ("input_sha256", _spreadsheet_safe(side), _spreadsheet_safe(digest), *padding)
        )

    for finding in findings:
        writer.writerow(("finding", "", "", *(_spreadsheet_safe(finding.get(c)) for c in columns)))
    return output.getvalue().encode("utf-8")


@router.get(
    "/projects/{project_id}/audits/{audit_id}/report.json",
    tags=["audits"],
    response_class=Response,
    responses={
        200: {
            "description": "Deterministic JSON report attachment.",
            "content": {"application/json": {"schema": {"type": "object"}}},
            "headers": _ATTACHMENT_RESPONSE_HEADERS,
        }
    },
)
def download_report_json(project_id: UUID, audit_id: UUID, session: SessionDep):
    resolved_id, report = _completed_report(session, project_id, audit_id)
    content = json.dumps(
        report,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return Response(
        content=content,
        media_type="application/json",
        headers=_attachment_headers(resolved_id, "json"),
    )


@router.get(
    "/projects/{project_id}/audits/{audit_id}/report.csv",
    tags=["audits"],
    response_class=Response,
    responses={
        200: {
            "description": "Spreadsheet-safe CSV report attachment.",
            "content": {"text/csv": {"schema": {"type": "string"}}},
            "headers": _ATTACHMENT_RESPONSE_HEADERS,
        }
    },
)
def download_report_csv(project_id: UUID, audit_id: UUID, session: SessionDep):
    resolved_id, report = _completed_report(session, project_id, audit_id)
    return Response(
        content=_csv_bytes(report),
        media_type="text/csv",
        headers=_attachment_headers(resolved_id, "csv"),
    )
