import csv
import io
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.models import AuditRun, Dataset, Project
from app.main import create_app


def seed_audit(client, report, status="completed"):
    project_id = str(uuid4())
    source_id = str(uuid4())
    target_id = str(uuid4())
    audit_id = str(uuid4())
    with client.app.state.database.sessions.begin() as session:
        session.add(Project(id=project_id, name="Export test", description=""))
        session.flush()
        session.add_all(
            [
                Dataset(
                    id=source_id,
                    project_id=project_id,
                    side="source",
                    filename="source.csv",
                    sha256="a" * 64,
                    row_count=1,
                    headers=["id"],
                ),
                Dataset(
                    id=target_id,
                    project_id=project_id,
                    side="target",
                    filename="target.csv",
                    sha256="b" * 64,
                    row_count=1,
                    headers=["id"],
                ),
            ]
        )
        session.flush()
        session.add(
            AuditRun(
                id=audit_id,
                project_id=project_id,
                source_dataset_id=source_id,
                target_dataset_id=target_id,
                contract={},
                status=status,
                report=report,
            )
        )
    return project_id, audit_id


def export_report():
    return {
        "engine_version": "0.2.0",
        "verdict": "not_verified",
        "source_rows": 1,
        "target_rows": 1,
        "matched_records": 1,
        "compared_fields": 0,
        "compared_relationships": 1,
        "finding_counts": {"missing_parent": 1},
        "findings": [
            {
                "code": "missing_parent",
                "side": "source",
                "record_key": ' =HYPERLINK("https://example.invalid")',
                "field": "\t+SUM(1,1)",
                "expected": "\r\n-1",
                "actual": "@cmd",
                "record_number": 1,
                "relationship": "contact_company",
                "dataset_pair": "companies",
            }
        ],
        "findings_truncated": True,
        "scope": "Selected fields and declared relationships only.",
        "input_sha256": {
            "source": "a" * 64,
            "target": "b" * 64,
            "parent:companies:source": "c" * 64,
            "parent:companies:target": "d" * 64,
        },
    }


def test_json_and_csv_report_downloads_are_complete_deterministic_and_safe(client):
    report = export_report()
    project_id, audit_id = seed_audit(client, report)
    base = f"/api/v1/projects/{project_id}/audits/{audit_id}/report"

    json_response = client.get(base + ".json")
    assert json_response.status_code == 200
    assert json_response.json() == report
    assert client.get(base + ".json").content == json_response.content
    assert json_response.headers["content-disposition"] == (
        f'attachment; filename="audit-report-{audit_id}.json"'
    )
    assert json_response.headers["cache-control"] == "no-store"
    assert json_response.headers["x-content-type-options"] == "nosniff"

    csv_response = client.get(base + ".csv")
    assert csv_response.status_code == 200
    assert client.get(base + ".csv").content == csv_response.content
    parsed_rows = list(csv.DictReader(io.StringIO(csv_response.text, newline="")))
    summary = {row["key"]: row["value"] for row in parsed_rows if row["row_type"] == "summary"}
    assert summary["verdict"] == "not_verified"
    assert summary["compared_relationships"] == "1"
    assert summary["findings_truncated"] == "true"
    assert summary["scope"] == report["scope"]
    counts = {row["key"]: row["value"] for row in parsed_rows if row["row_type"] == "finding_count"}
    assert counts == {"missing_parent": "1"}
    hashes = {row["key"]: row["value"] for row in parsed_rows if row["row_type"] == "input_sha256"}
    assert hashes == report["input_sha256"]

    finding = next(row for row in parsed_rows if row["row_type"] == "finding")
    for key in ("record_key", "field", "expected", "actual"):
        assert finding[key] == "'" + report["findings"][0][key]
    assert finding["relationship"] == "contact_company"
    assert finding["dataset_pair"] == "companies"
    csv_rows = list(csv.reader(io.StringIO(csv_response.text, newline="")))
    assert all(len(row) == len(csv_rows[0]) for row in csv_rows)


def test_report_downloads_keep_auth_scoping_and_completion_gates(settings: Settings):
    configured = settings.model_copy(update={"api_key": type(settings.api_key)("export-secret")})
    with TestClient(create_app(configured)) as client:
        project_id, audit_id = seed_audit(client, export_report(), status="running")
        path = f"/api/v1/projects/{project_id}/audits/{audit_id}/report.json"
        assert client.get(path).status_code == 401
        headers = {"X-API-Key": "export-secret"}
        assert client.get(path, headers=headers).status_code == 409
        wrong_project = f"/api/v1/projects/{uuid4()}/audits/{audit_id}/report.json"
        assert client.get(wrong_project, headers=headers).status_code == 404
