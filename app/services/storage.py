from pathlib import Path
from uuid import UUID


class LocalStorage:
    """An immutable local file adapter. Add an S3 implementation behind this interface later."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, dataset_id: str) -> Path:
        # Uploaded filenames are never used to construct paths.
        return self.root / f"{UUID(dataset_id)}.csv"

    def put(self, dataset_id: str, content: bytes) -> None:
        with self._path(dataset_id).open("xb") as handle:
            handle.write(content)

    def read(self, dataset_id: str, limit: int) -> bytes:
        with self._path(dataset_id).open("rb") as handle:
            content = handle.read(limit + 1)
        if len(content) > limit:
            raise ValueError("Stored file exceeds the configured limit")
        return content

    def delete(self, dataset_id: str) -> None:
        self._path(dataset_id).unlink(missing_ok=True)
