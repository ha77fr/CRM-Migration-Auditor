from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_matches_models_and_can_downgrade(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path.as_posix()}/migrations.db"
    monkeypatch.setenv("AUDITOR_DATABASE_URL", url)
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    command.upgrade(config, "head")
    command.check(config)
    engine = create_engine(url)
    assert {"projects", "datasets", "audit_runs"}.issubset(inspect(engine).get_table_names())
    command.downgrade(config, "base")
    assert "audit_runs" not in inspect(engine).get_table_names()
    engine.dispose()
