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
            contract = AuditContract.model_validate(audit.contract)
            storage = LocalStorage(settings.storage_dir)
            tables = {}
            hashes = {}

            def load(dataset_id: str, side: str):
                if dataset_id not in tables:
                    dataset = session.get(Dataset, dataset_id)
                    if (
                        dataset is None
                        or dataset.project_id != audit.project_id
                        or dataset.side != side
                    ):
                        raise InvalidDataset("Dataset is unavailable in this project and side")
                    content = storage.read(dataset_id, settings.max_upload_bytes)
                    if sha256(content).hexdigest() != dataset.sha256:
                        raise InvalidDataset("Snapshot checksum mismatch")
                    tables[dataset_id] = read_csv(content, settings.max_rows)
                    hashes[dataset_id] = dataset.sha256
                return tables[dataset_id]

            source = load(audit.source_dataset_id, "source")
            target = load(audit.target_dataset_id, "target")
            parent_tables = {
                name: (
                    load(str(pair.source_dataset_id), "source"),
                    load(str(pair.target_dataset_id), "target"),
                )
                for name, pair in sorted(contract.parent_pairs.items())
            }
            report = compare(source, target, contract, settings.max_findings, parent_tables)
            report.input_sha256 = {
                "source": hashes[audit.source_dataset_id],
                "target": hashes[audit.target_dataset_id],
            }
            for name, pair in sorted(contract.parent_pairs.items()):
                report.input_sha256[f"parent:{name}:source"] = hashes[str(pair.source_dataset_id)]
                report.input_sha256[f"parent:{name}:target"] = hashes[str(pair.target_dataset_id)]
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
