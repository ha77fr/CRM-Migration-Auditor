import json
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.audits import execute_audit

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def project(client):
    response = client.post("/api/v1/projects", json={"name": "Test migration"})
    assert response.status_code == 201
    return f"/api/v1/projects/{response.json()['id']}"


def upload(client, base, side, content=None, filename="input.csv"):
    content = content if content is not None else (EXAMPLES / f"{side}.csv").read_bytes()
    return client.post(
        f"{base}/datasets?side={side}", files={"file": (filename, content, "text/csv")}
    )


def prepared(client):
    base = project(client)
    source = upload(client, base, "source")
    target = upload(client, base, "target")
    assert source.status_code == target.status_code == 201
    payload = {
        "source_dataset_id": source.json()["id"],
        "target_dataset_id": target.json()["id"],
        "contract": json.loads((EXAMPLES / "contract.json").read_text()),
    }
    return base, payload


def test_full_flow_persistence_and_duplicate_job_delivery(client, settings):
    assert client.get("/health/ready").status_code == 200
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").json()["info"]["title"] == "CRM Migration Auditor"
    base, payload = prepared(client)
    response = client.post(base + "/audits", json=payload)
    assert response.status_code == 202
    path = f"{base}/audits/{response.json()['id']}"
    status = client.get(path).json()
    assert status["status"] == "completed"
    report = client.get(path + "/report").json()
    assert report["verdict"] == "failed"
    assert report["finding_counts"] == {
        "field_mismatch": 1,
        "missing_record": 1,
        "unexpected_record": 1,
    }
    assert len(report["input_sha256"]["source"]) == 64
    execute_audit(response.json()["id"], client.app.state.database, settings)
    assert client.get(path).json()["finished_at"] == status["finished_at"]
    assert client.post(path + "/retry").status_code == 409
    with TestClient(create_app(settings)) as reopened:
        assert reopened.get(path + "/report").json() == report
    assert len(client.get(base + "/datasets").json()) == 2
    assert len(client.get(base + "/audits").json()) == 1


def test_project_scoping_prevents_cross_project_dataset_use(client):
    base, payload = prepared(client)
    other = project(client)
    assert client.post(other + "/audits", json=payload).status_code == 404
    created = client.post(base + "/audits", json=payload).json()
    assert client.get(f"{other}/audits/{created['id']}/report").status_code == 404


def test_contract_headers_side_validation_and_unknown_ids(client):
    base, payload = prepared(client)
    payload["contract"]["source_key"] = "MissingColumn"
    assert client.post(base + "/audits", json=payload).status_code == 422
    payload["contract"]["source_key"] = "Id"
    payload["source_dataset_id"] = payload["target_dataset_id"]
    assert client.post(base + "/audits", json=payload).status_code == 422
    payload["source_dataset_id"] = str(uuid4())
    assert client.post(base + "/audits", json=payload).status_code == 404


def test_upload_limits_and_untrusted_filenames(client, settings):
    base = project(client)
    assert upload(client, base, "source", b"id,id\n1,2").status_code == 422
    assert upload(client, base, "source", b"id,v\n1,A", "file.xlsx").status_code == 422
    response = upload(client, base, "source", b"id,v\n1,A", "../../escape.csv")
    assert response.status_code == 201
    assert (settings.storage_dir / f"{response.json()['id']}.csv").is_file()
    settings.max_upload_bytes = 10
    assert upload(client, base, "source", b"id,v\n1,1234567890").status_code == 413
    assert len(list(settings.storage_dir.glob("*.csv"))) == 1


def test_pending_failed_and_retry_lifecycle(client, settings, monkeypatch):
    base, payload = prepared(client)
    with monkeypatch.context() as paused:
        paused.setattr("app.api.routes.execute_audit", lambda *_: None)
        created = client.post(base + "/audits", json=payload).json()
    path = f"{base}/audits/{created['id']}"
    assert client.get(path + "/report").status_code == 409
    file_path = settings.storage_dir / f"{payload['source_dataset_id']}.csv"
    original = file_path.read_bytes()
    file_path.write_bytes(b"tampered")
    execute_audit(created["id"], client.app.state.database, settings)
    failed = client.get(path).json()
    assert failed["status"] == "failed"
    assert failed["error_code"] == "input_unavailable_or_invalid"
    file_path.write_bytes(original)
    assert client.post(path + "/retry").status_code == 202
    assert client.get(path).json()["status"] == "completed"


def test_queue_outage_is_recorded_and_retryable(client, settings, monkeypatch):
    base, payload = prepared(client)

    def unavailable(*_args, **_kwargs):
        raise ConnectionError("Private broker detail must not reach the response")

    fake = SimpleNamespace(celery_app=SimpleNamespace(send_task=unavailable))
    monkeypatch.setitem(sys.modules, "app.workers.celery_app", fake)
    settings.task_backend = "celery"
    response = client.post(base + "/audits", json=payload)
    assert response.status_code == 503
    assert "Private broker" not in response.text
    path = f"{base}/audits/{response.json()['detail']['audit_id']}"
    assert client.get(path).json()["error_code"] == "dispatch_unavailable"
    settings.task_backend = "local"
    assert client.post(path + "/retry").status_code == 202
    assert client.get(path).json()["status"] == "completed"


def test_optional_api_key_and_health(settings):
    configured = settings.model_copy(update={"api_key": type(settings.api_key)("test-secret")})
    with TestClient(create_app(configured)) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/api/v1/projects").status_code == 401
        assert client.get("/api/v1/projects", headers={"X-API-Key": "wrong"}).status_code == 401
        assert (
            client.get("/api/v1/projects", headers={"X-API-Key": "test-secret"}).status_code == 200
        )


def test_ready_requires_schema(settings):
    with TestClient(
        create_app(settings.model_copy(update={"auto_create_schema": False}))
    ) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 503
