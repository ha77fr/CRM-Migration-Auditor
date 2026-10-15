import json
import sys
from contextlib import nullcontext
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.db.models import Project
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

    fake = SimpleNamespace(
        celery_app=SimpleNamespace(
            send_task=unavailable, connection_for_write=lambda *_: nullcontext()
        )
    )
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


def test_celery_dispatch_uses_the_application_broker(client, settings):
    pytest.importorskip("celery")
    from kombu import Connection

    base, payload = prepared(client)
    settings.task_backend = "celery"
    settings.broker_url = "memory://"
    with Connection(settings.broker_url) as connection:
        with connection.SimpleQueue("celery") as queue:
            queue.clear()
            response = client.post(base + "/audits", json=payload)
            assert response.status_code == 202
            audit_id = response.json()["id"]
            message = queue.get(block=True, timeout=1)
            try:
                assert message.headers["task"] == "auditor.execute"
                assert message.headers["id"] == audit_id
                assert message.payload[0] == [audit_id]
            finally:
                message.ack()
    path = f"{base}/audits/{audit_id}"
    assert client.get(path).json()["status"] == "queued"
    assert client.get(path + "/report").status_code == 409


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


@pytest.mark.parametrize("database_url", ["sqlite://", "sqlite:///:memory:"])
def test_in_memory_database_is_shared_with_request_and_background_threads(settings, database_url):
    configured = settings.model_copy(update={"database_url": database_url})
    with TestClient(create_app(configured)) as connection:
        assert connection.get("/health/ready").status_code == 200
        base, payload = prepared(connection)
        created = connection.post(base + "/audits", json=payload)
        assert created.status_code == 202
        path = f"{base}/audits/{created.json()['id']}"
        assert connection.get(path).json()["status"] == "completed"
        assert connection.get(path + "/report").status_code == 200
        assert len(connection.get(base + "/datasets").json()) == 2


@pytest.mark.parametrize("field", ["name", "description"])
def test_invalid_unicode_project_input_returns_validation_error(client, field):
    payload = {"name": "Valid name", field: "\ud800"}
    response = client.post(
        "/api/v1/projects",
        content=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert client.get("/api/v1/projects").json() == []


@pytest.mark.parametrize("number", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_non_finite_tolerance_returns_json_validation_error(client, number):
    base, payload = prepared(client)
    payload["contract"]["fields"][0]["tolerance"] = "invalid-number"
    body = json.dumps(payload).replace('"invalid-number"', number)
    response = client.post(
        base + "/audits", content=body, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["type"] == "finite_number"
    assert error["loc"] == ["body", "contract", "fields", 0, "tolerance"]
    assert client.get(base + "/audits").json() == []


def relationship_prepared(client):
    base = project(client)
    source = upload(client, base, "source", b"id,company\n1,A\n").json()
    target = upload(client, base, "target", b"id,company\n1,X\n").json()
    source_parent = upload(client, base, "source", b"id\nA\nB\n").json()
    target_parent = upload(client, base, "target", b"id\nX\nY\n").json()
    return base, {
        "source_dataset_id": source["id"],
        "target_dataset_id": target["id"],
        "contract": {
            "source_key": "id",
            "target_key": "id",
            "parent_pairs": {
                "companies": {
                    "source_dataset_id": source_parent["id"],
                    "target_dataset_id": target_parent["id"],
                    "source_key": "id",
                    "target_key": "id",
                    "key_map": {"A": "X", "B": "Y"},
                }
            },
            "relationships": [
                {"source": "company", "target": "company", "parent_pair": "companies"}
            ],
        },
    }


def test_relationship_audit_provenance_and_parent_integrity(client, settings, monkeypatch):
    base, payload = relationship_prepared(client)
    created = client.post(base + "/audits", json=payload)
    assert created.status_code == 202
    report = client.get(f"{base}/audits/{created.json()['id']}/report").json()
    assert report["verdict"] == "passed"
    assert report["compared_relationships"] == 1
    assert set(report["input_sha256"]) == {
        "source",
        "target",
        "parent:companies:source",
        "parent:companies:target",
    }
    with monkeypatch.context() as paused:
        paused.setattr("app.api.routes.execute_audit", lambda *_: None)
        pending = client.post(base + "/audits", json=payload).json()
    parent_id = payload["contract"]["parent_pairs"]["companies"]["source_dataset_id"]
    (settings.storage_dir / f"{parent_id}.csv").write_bytes(b"id\naltered\n")
    execute_audit(pending["id"], client.app.state.database, settings)
    path = f"{base}/audits/{pending['id']}"
    assert client.get(path).json()["error_code"] == "input_unavailable_or_invalid"
    assert client.get(path + "/report").status_code == 409


def test_relationship_parent_project_side_and_headers_are_validated(client):
    base, payload = relationship_prepared(client)
    pair = payload["contract"]["parent_pairs"]["companies"]
    original_id = pair["source_dataset_id"]
    other = project(client)
    pair["source_dataset_id"] = upload(client, other, "source", b"id\nA\n").json()["id"]
    assert client.post(base + "/audits", json=payload).status_code == 404
    pair["source_dataset_id"] = pair["target_dataset_id"]
    assert client.post(base + "/audits", json=payload).status_code == 422
    pair["source_dataset_id"] = original_id
    pair["source_key"] = "missing"
    assert client.post(base + "/audits", json=payload).status_code == 422


@pytest.mark.parametrize("schema", ["projects_only", "missing_column"])
def test_ready_rejects_partial_schema(settings, schema):
    engine = create_engine(settings.database_url)
    if schema == "projects_only":
        Project.__table__.create(engine)
    else:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE projects (id VARCHAR(36) PRIMARY KEY)"))
    engine.dispose()
    with TestClient(
        create_app(settings.model_copy(update={"auto_create_schema": False}))
    ) as client:
        assert client.get("/health/ready").status_code == 503


def test_company_contact_deal_hierarchy_checks_both_parent_pairs(client):
    base, contacts = relationship_prepared(client)
    contact_run = client.post(base + "/audits", json=contacts).json()
    contact_report = client.get(f"{base}/audits/{contact_run['id']}/report").json()
    assert contact_report["verdict"] == "passed"
    source = upload(client, base, "source", b"id,contact,company\nD1,1,B\n").json()
    target = upload(client, base, "target", b"id,contact,company\nD1,1,X\n").json()
    deal_contract = {
        "source_key": "id",
        "target_key": "id",
        "parent_pairs": {
            "companies": contacts["contract"]["parent_pairs"]["companies"],
            "contacts": {
                "source_dataset_id": contacts["source_dataset_id"],
                "target_dataset_id": contacts["target_dataset_id"],
                "source_key": "id",
                "target_key": "id",
            },
        },
        "relationships": [
            {"source": "contact", "target": "contact", "parent_pair": "contacts"},
            {"source": "company", "target": "company", "parent_pair": "companies"},
        ],
    }
    payload = {
        "source_dataset_id": source["id"],
        "target_dataset_id": target["id"],
        "contract": deal_contract,
    }
    deal_run = client.post(base + "/audits", json=payload).json()
    report = client.get(f"{base}/audits/{deal_run['id']}/report").json()
    assert report["verdict"] == "failed"
    assert report["compared_relationships"] == 2
    assert report["finding_counts"] == {"relationship_mismatch": 1}
    assert report["findings"][0]["dataset_pair"] == "companies"
    assert report["findings"][0]["expected"] == "Y"
    assert set(report["input_sha256"]) == {
        "source",
        "target",
        "parent:companies:source",
        "parent:companies:target",
        "parent:contacts:source",
        "parent:contacts:target",
    }
    corrected = upload(client, base, "target", b"id,contact,company\nD1,1,Y\n").json()
    payload["target_dataset_id"] = corrected["id"]
    corrected_run = client.post(base + "/audits", json=payload).json()
    assert client.get(f"{base}/audits/{corrected_run['id']}/report").json()["verdict"] == "passed"


def test_persisted_timestamps_remain_utc_across_reloads(client, settings):
    base, payload = prepared(client)
    response = client.post(base + "/audits", json=payload)
    assert response.status_code == 202
    created = response.json()
    path = f"{base}/audits/{created['id']}"
    audit = client.get(path).json()
    assert audit["created_at"] == created["created_at"]
    timestamps = [
        client.get(base).json()["created_at"],
        *(dataset["created_at"] for dataset in client.get(base + "/datasets").json()),
        *(audit[field] for field in ("created_at", "started_at", "finished_at")),
    ]
    assert all(datetime.fromisoformat(value).tzinfo == UTC for value in timestamps)
    with TestClient(create_app(settings)) as reopened:
        assert reopened.get(path).json() == audit
