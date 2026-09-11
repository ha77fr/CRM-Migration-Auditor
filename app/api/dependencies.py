import secrets
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(request: Request, key: Annotated[str | None, Security(api_key_header)]) -> None:
    expected = request.app.state.settings.api_key.get_secret_value()
    if expected and not secrets.compare_digest((key or "").encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="A valid X-API-Key is required")


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.database.sessions() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
