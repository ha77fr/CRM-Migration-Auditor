from celery import Celery

from app.core.config import Settings
from app.db.session import Database
from app.services.audits import execute_audit

settings = Settings()
celery_app = Celery("auditor", broker=settings.broker_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_ignore_result=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_connection_timeout=3,
    broker_transport_options={"socket_connect_timeout": 3, "socket_timeout": 3},
)


@celery_app.task(name="auditor.execute")
def run_audit(audit_id: str) -> None:
    database = Database(settings.database_url)
    try:
        execute_audit(audit_id, database, settings)
    finally:
        database.dispose()
