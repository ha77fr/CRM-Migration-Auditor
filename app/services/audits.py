import logging
from hashlib import sha256

from sqlalchemy import update

from app.core.config import Settings
from app.db.models import AuditRun, Dataset, utcnow
from app.db.session import Database
from app.domain.contracts import AuditContract
from app.domain.csv_reader import InvalidDataset, read_csv
from app.domain.engine import compare
from app.services.storage import LocalStorage

logger = logging.getLogger(__name__)


def execute_audit(audit_id: str, database: Database, settings: Settings) -> None:
    """Shared local/Celery handler. An atomic claim makes duplicate deliveries harmless.

    Deliberately no automatic recovery of interrupted running jobs in this starter:
    production recovery needs leases and fencing, not blind task redelivery.
    """
    with database.sessions.begin() as session:
        claimed = session.execute(
            update(AuditRun)
            .where(AuditRun.id == audit_id, AuditRun.status == "queued")
            .values(status="running", started_at=utcnow(), error_code=None)
        )
        if claimed.rowcount != 1:
            return

    try:
        with database.sessions() as session:
            audit = session.get(AuditRun, audit_id)
            source = session.get(Dataset, audit.source_dataset_id)
            target = session.get(Dataset, audit.target_dataset_id)
            storage = LocalStorage(settings.storage_dir)
            source_bytes = storage.read(source.id, settings.max_upload_bytes)
            target_bytes = storage.read(target.id, settings.max_upload_bytes)
            if sha256(source_bytes).hexdigest() != source.sha256:
                raise InvalidDataset("Source snapshot checksum mismatch")
            if sha256(target_bytes).hexdigest() != target.sha256:
                raise InvalidDataset("Target snapshot checksum mismatch")
            report = compare(
                read_csv(source_bytes, settings.max_rows),
                read_csv(target_bytes, settings.max_rows),
                AuditContract.model_validate(audit.contract),
                settings.max_findings,
            )
            report.input_sha256 = {"source": source.sha256, "target": target.sha256}
        with database.sessions.begin() as session:
            session.execute(
                update(AuditRun)
                .where(AuditRun.id == audit_id)
                .values(
                    status="completed",
                    report=report.model_dump(mode="json"),
                    finished_at=utcnow(),
                )
            )
    except Exception as exc:
        # Do not log exception messages or tracebacks: DB errors may contain customer data.
        logger.error("Audit %s failed (%s)", audit_id, type(exc).__name__)
        error_code = (
            "input_unavailable_or_invalid"
            if isinstance(exc, (OSError, ValueError))
            else "audit_execution_failed"
        )
        with database.sessions.begin() as session:
            session.execute(
                update(AuditRun)
                .where(AuditRun.id == audit_id)
                .values(
                    status="failed",
                    error_code=error_code,
                    finished_at=utcnow(),
                )
            )
