from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.domain.contracts import AuditContract


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: str = Field(default="", max_length=2000)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    created_at: datetime


class DatasetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    side: Literal["source", "target"]
    filename: str
    sha256: str
    row_count: int
    headers: list[str]
    created_at: datetime


class AuditCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_dataset_id: UUID
    target_dataset_id: UUID
    contract: AuditContract


class AuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    source_dataset_id: str
    target_dataset_id: str
    contract: AuditContract
    status: Literal["queued", "running", "completed", "failed"]
    error_code: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
