from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes import router
from app.core.config import Settings
from app.db.models import Project
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
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "Developer starter for comparing immutable CRM CSV exports. Create a project, "
            "upload source/target datasets, and submit an explicit audit contract. "
            "Default mode is local and single-user. Reports cover selected fields only."
        ),
    )
    application.include_router(router)

    @application.get("/", tags=["system"])
    def root():
        return {"name": "CRM Migration Auditor", "version": "0.1.0", "docs": "/docs"}

    @application.get("/health/live", tags=["system"])
    def live():
        return {"status": "ok"}

    @application.get("/health/ready", tags=["system"])
    def ready():
        try:
            with application.state.database.sessions() as session:
                session.execute(select(Project.id).limit(1))
        except SQLAlchemyError:
            raise HTTPException(503, "Database or schema unavailable") from None
        return {"status": "ready", "task_backend": settings.task_backend}

    return application
