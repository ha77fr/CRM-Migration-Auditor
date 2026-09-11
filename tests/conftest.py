import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path.as_posix()}/test.db",
        storage_dir=tmp_path / "uploads",
        task_backend="local",
        auto_create_schema=True,
        api_key="",
        max_upload_bytes=5 * 1024 * 1024,
        max_rows=25_000,
        max_findings=1000,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as connection:
        yield connection
