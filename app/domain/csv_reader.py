import csv
import io
from dataclasses import dataclass


class InvalidDataset(ValueError):
    """Expected input error. Messages must never include uploaded cell contents."""


@dataclass(frozen=True)
class Table:
    headers: list[str]
    rows: list[dict[str, str]]


def read_csv(content: bytes, max_rows: int) -> Table:
    """Read bounded, comma-separated UTF-8 CSV. Values and ID leading zeros are preserved."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise InvalidDataset("CSV must be UTF-8 encoded") from exc
    if "\x00" in text:
        raise InvalidDataset("CSV must not contain null bytes")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        headers = next(reader, [])
        if not headers or any(not header.strip() for header in headers):
            raise InvalidDataset("CSV must have non-empty column headers")
        if len(headers) > 200 or any(len(header) > 255 for header in headers):
            raise InvalidDataset("CSV supports up to 200 columns with 255-character headers")
        if len(set(headers)) != len(headers):
            raise InvalidDataset("CSV contains duplicate column headers")
        rows = []
        for cells in reader:
            if not cells:  # Ignore empty physical records, but retain rows of empty values.
                continue
            if len(cells) != len(headers):
                raise InvalidDataset("CSV contains a row with a different number of columns")
            if len(rows) >= max_rows:
                raise InvalidDataset("CSV exceeds the configured row limit")
            rows.append(dict(zip(headers, cells, strict=True)))
    except csv.Error as exc:
        raise InvalidDataset("CSV is malformed or contains an oversized field") from exc
    return Table(headers, rows)
