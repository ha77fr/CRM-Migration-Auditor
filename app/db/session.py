from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base


class Database:
    def __init__(self, url: str):
        parsed = make_url(url)
        sqlite = parsed.get_backend_name() == "sqlite"
        if sqlite and parsed.database not in (None, "", ":memory:"):
            Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            url,
            pool_pre_ping=True,
            connect_args={"check_same_thread": False, "timeout": 30} if sqlite else {},
            poolclass=StaticPool if sqlite and parsed.database in (None, "", ":memory:") else None,
        )
        if sqlite:

            @event.listens_for(self.engine, "connect")
            def enable_foreign_keys(connection, _record):
                connection.execute("PRAGMA foreign_keys=ON")

        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def create_schema(self) -> None:
        """Local convenience only. Use Alembic migrations for persistent deployments."""
        Base.metadata.create_all(self.engine)

    def dispose(self) -> None:
        self.engine.dispose()
