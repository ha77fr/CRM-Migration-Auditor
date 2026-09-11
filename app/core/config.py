from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AUDITOR_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./.data/auditor.db"
    storage_dir: Path = Path(".data/uploads")
    task_backend: Literal["local", "celery"] = "local"
    auto_create_schema: bool = True
    broker_url: str = "redis://localhost:6379/0"
    api_key: SecretStr = SecretStr("")
    max_upload_bytes: int = Field(default=5 * 1024 * 1024, ge=1, le=100 * 1024 * 1024)
    max_rows: int = Field(default=25_000, ge=1, le=1_000_000)
    max_findings: int = Field(default=1000, ge=1, le=10_000)
