import json
from contextlib import asynccontextmanager
from math import isfinite

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.report_exports import router as report_exports_router
from app.api.routes import router
from app.core.config import Settings
from app.db.models import AuditRun, Dataset, Project
from app.db.session import Database
from app.services.storage import LocalStorage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        database = Database(settings.database_url)
        application.state.settings = settings
        application.state.database = database
        application.state.storage = LocalStorage(settings.storage_dir)
        try:
            if settings.auto_create_schema:
                database.create_schema()
            yield
        finally:
            database.dispose()

    application = FastAPI(
        title="CRM Migration Auditor",
        version="0.2.0",
        lifespan=lifespan,
        description=(
            "Local auditor for immutable CRM CSV exports. Create a project, upload "
            "source/target datasets, and submit explicit field and relationship rules. "
            "Reports and downloads cover only the declared scope."
        ),
    )
    application.include_router(router)
    application.include_router(report_exports_router)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        # Rejected inputs can contain non-finite numbers or invalid Unicode.
        detail = jsonable_encoder(
            exc.errors(),
            custom_encoder={float: lambda value: value if isfinite(value) else str(value)},
        )
        return Response(
            content=json.dumps({"detail": detail}, ensure_ascii=True, allow_nan=False),
            status_code=422,
            media_type="application/json",
        )

    @application.get("/", tags=["system"])
    def root():
        return {"name": "CRM Migration Auditor", "version": "0.2.0", "docs": "/docs"}

    @application.get("/health/live", tags=["system"])
    def live():
        return {"status": "ok"}

    @application.get("/health/ready", tags=["system"])
    def ready():
        try:
            with application.state.database.sessions() as session:
                for model in (Project, Dataset, AuditRun):
                    session.execute(select(model).limit(0))
        except SQLAlchemyError:
            raise HTTPException(503, "Database or schema unavailable") from None
        return {"status": "ready", "task_backend": settings.task_backend}

    return application
