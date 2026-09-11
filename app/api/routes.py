import logging
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from sqlalchemy import select, update

from app.api.dependencies import SessionDep, require_api_key
from app.api.schemas import AuditCreate, AuditRead, DatasetRead, ProjectCreate, ProjectRead
from app.db.models import AuditRun, Dataset, Project, new_id, utcnow
from app.domain.csv_reader import InvalidDataset, read_csv
from app.domain.reports import AuditReport
from app.services.audits import execute_audit

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_api_key)])
logger = logging.getLogger(__name__)


def require_project(session, project_id: UUID) -> Project:
    project = session.get(Project, str(project_id))
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def require_audit(session, project_id: UUID, audit_id: UUID) -> AuditRun:
    audit = session.get(AuditRun, str(audit_id))
    if audit is None or audit.project_id != str(project_id):
        raise HTTPException(404, "Audit not found in this project")
    return audit


def dispatch(audit: AuditRun, request: Request, background_tasks: BackgroundTasks, session) -> None:
    settings = request.app.state.settings
    if settings.task_backend == "local":
        background_tasks.add_task(execute_audit, audit.id, request.app.state.database, settings)
        return
    try:
        from app.workers.celery_app import celery_app

        celery_app.send_task("auditor.execute", args=[audit.id], task_id=audit.id, retry=False)
    except Exception as exc:
        logger.error("Dispatch %s failed (%s)", audit.id, type(exc).__name__)
        # A broker timeout can be ambiguous. Only fail a run that has not been claimed.
        session.execute(
            update(AuditRun)
            .where(
                AuditRun.id == audit.id,
                AuditRun.status == "queued",
            )
            .values(status="failed", error_code="dispatch_unavailable", finished_at=utcnow())
        )
        session.commit()
        raise HTTPException(
            503, {"message": "Worker queue unavailable", "audit_id": audit.id}
        ) from None


@router.post("/projects", response_model=ProjectRead, status_code=201, tags=["projects"])
def create_project(payload: ProjectCreate, session: SessionDep):
    project = Project(**payload.model_dump())
    session.add(project)
    session.commit()
    return project


@router.get("/projects", response_model=list[ProjectRead], tags=["projects"])
def list_projects(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return session.scalars(
        select(Project).order_by(Project.created_at, Project.id).offset(offset).limit(limit)
    ).all()


@router.get("/projects/{project_id}", response_model=ProjectRead, tags=["projects"])
def get_project(project_id: UUID, session: SessionDep):
    return require_project(session, project_id)


@router.post(
    "/projects/{project_id}/datasets",
    response_model=DatasetRead,
    status_code=201,
    tags=["datasets"],
)
def upload_dataset(
    project_id: UUID,
    side: Literal["source", "target"],
    request: Request,
    session: SessionDep,
    file: Annotated[UploadFile, File(description="UTF-8 CSV")],
):
    require_project(session, project_id)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(422, "Upload a .csv file")
    settings = request.app.state.settings
    content = file.file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(413, "CSV exceeds the configured file size limit")
    try:
        table = read_csv(content, settings.max_rows)
    except InvalidDataset as exc:
        raise HTTPException(422, str(exc)) from None
    dataset = Dataset(
        id=new_id(),
        project_id=str(project_id),
        side=side,
        filename=file.filename[:255],
        sha256=sha256(content).hexdigest(),
        headers=table.headers,
        row_count=len(table.rows),
    )
    storage = request.app.state.storage
    storage.put(dataset.id, content)
    try:
        session.add(dataset)
        session.commit()
    except Exception:
        session.rollback()
        storage.delete(dataset.id)
        raise
    return dataset


@router.get("/projects/{project_id}/datasets", response_model=list[DatasetRead], tags=["datasets"])
def list_datasets(
    project_id: UUID,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    require_project(session, project_id)
    return session.scalars(
        select(Dataset)
        .where(Dataset.project_id == str(project_id))
        .order_by(Dataset.created_at, Dataset.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.post(
    "/projects/{project_id}/audits", response_model=AuditRead, status_code=202, tags=["audits"]
)
def create_audit(
    project_id: UUID,
    payload: AuditCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    session: SessionDep,
):
    require_project(session, project_id)
    datasets = []
    for dataset_id, side in [
        (payload.source_dataset_id, "source"),
        (payload.target_dataset_id, "target"),
    ]:
        dataset = session.get(Dataset, str(dataset_id))
        if dataset is None or dataset.project_id != str(project_id):
            raise HTTPException(404, "Dataset not found in this project")
        if dataset.side != side:
            raise HTTPException(422, "Dataset source/target side does not match the request")
        datasets.append(dataset)
    try:
        payload.contract.validate_headers(datasets[0].headers, datasets[1].headers)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    audit = AuditRun(
        project_id=str(project_id),
        source_dataset_id=str(payload.source_dataset_id),
        target_dataset_id=str(payload.target_dataset_id),
        contract=payload.contract.model_dump(mode="json"),
    )
    session.add(audit)
    session.commit()
    dispatch(audit, request, background_tasks, session)
    return audit


@router.get("/projects/{project_id}/audits", response_model=list[AuditRead], tags=["audits"])
def list_audits(
    project_id: UUID,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    require_project(session, project_id)
    return session.scalars(
        select(AuditRun)
        .where(AuditRun.project_id == str(project_id))
        .order_by(AuditRun.created_at, AuditRun.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.get("/projects/{project_id}/audits/{audit_id}", response_model=AuditRead, tags=["audits"])
def get_audit(project_id: UUID, audit_id: UUID, session: SessionDep):
    return require_audit(session, project_id, audit_id)


@router.get(
    "/projects/{project_id}/audits/{audit_id}/report", response_model=AuditReport, tags=["audits"]
)
def get_report(project_id: UUID, audit_id: UUID, session: SessionDep):
    audit = require_audit(session, project_id, audit_id)
    if audit.status != "completed":
        raise HTTPException(409, "The report is available only after the audit completes")
    return audit.report


@router.post(
    "/projects/{project_id}/audits/{audit_id}/retry",
    response_model=AuditRead,
    status_code=202,
    tags=["audits"],
)
def retry_audit(
    project_id: UUID,
    audit_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    session: SessionDep,
):
    audit = require_audit(session, project_id, audit_id)
    changed = session.execute(
        update(AuditRun)
        .where(
            AuditRun.id == str(audit_id),
            AuditRun.status == "failed",
        )
        .values(status="queued", error_code=None, report=None, started_at=None, finished_at=None)
    )
    if changed.rowcount != 1:
        session.rollback()
        raise HTTPException(409, "Only a failed audit can be retried")
    session.commit()
    session.refresh(audit)
    dispatch(audit, request, background_tasks, session)
    return audit
