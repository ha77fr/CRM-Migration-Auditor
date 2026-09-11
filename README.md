# CRM Migration Auditor

A FastAPI backend starter for checking CRM migration exports. It includes a working
CSV-to-report flow, a pure Python comparison engine, persistence, migrations,
background-job adapters, and tests. The browser interface is Swagger at `/docs`;
a custom frontend is a future milestone.

## Run in your existing PyCharm project

Use **Python 3.14** and the existing `.venv` interpreter. Run these commands in the
project root using PyCharm's PowerShell terminal:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Your existing PyCharm **FastAPI** run configuration still targets `main.py`.
Alternatively, run `main.py` directly. Set the working directory to the project root.

Open <http://127.0.0.1:8000/docs>. SQLite and the upload directory are created under
`.data/` at startup. No Docker, Redis, cloud account, or AI key is needed locally.
The separate `.venvUV` directory is not used or modified by this scaffold.

Run the synthetic example in a second terminal while the server is running:

```powershell
.\.venv\Scripts\python.exe scripts/demo.py
```

This creates a new project, uploads two sample files, submits the sample contract,
polls the job, and prints its report. The expected result is **completed** with a
**failed** verdict: one missing record, one unexpected record, and one changed amount.
"Completed" describes successful execution; "failed" describes the data comparison.
Each demo invocation creates a separate project.

`test_main.http` provides the same workflow in PyCharm's HTTP client, capturing IDs
from preceding responses. Swagger also supports manual file uploads and submissions.

## Layout

```text
main.py                    Existing PyCharm-compatible entry point
app/main.py                App factory, lifespan, health endpoints
app/api/                   Routes, request/response schemas, dependencies
app/core/config.py         Environment-based settings
app/db/                    SQLAlchemy models and sessions
app/domain/                Pure contracts, CSV parsing, comparison, reports
app/services/              Audit execution and immutable local file adapter
app/workers/               Optional Celery adapter
migrations/                Alembic schema history
examples/                  Synthetic Salesforce-style and HubSpot-style exports
scripts/demo.py            End-to-end API example using the standard library
tests/                     Domain and API integration tests
docs/architecture.md       Design decisions, limitations, and extension roadmap
compose.yaml               PostgreSQL + Redis + API + worker development environment
```

## API workflow

All business endpoints are below `/api/v1`:

1. `POST /projects` — create a project.
2. `POST /projects/{id}/datasets?side=source` — multipart `file` upload.
3. Repeat the upload with `side=target`.
4. `POST /projects/{id}/audits` — supply the two dataset IDs and an audit contract.
5. `GET /projects/{id}/audits/{audit_id}` — execution status.
6. `GET /projects/{id}/audits/{audit_id}/report` — report after completion.
7. `POST /projects/{id}/audits/{audit_id}/retry` — retry an execution that failed.

Projects, datasets, and audit runs also have list endpoints with `limit` and
`offset`. `/health/live` checks HTTP availability; `/health/ready` checks the
database schema. Readiness does **not** verify worker availability.

Example contract (`examples/contract.json` contains a larger example):

```json
{
  "version": "1",
  "source_key": "Id",
  "target_key": "LegacyId",
  "fields": [
    {"source": "Email", "target": "email", "normalizers": ["strip", "casefold"]},
    {"source": "Amount", "target": "amount", "comparison": "decimal", "tolerance": "0.01"}
  ],
  "key_map": {}
}
```

IDs are exact strings: leading zeros and case are preserved. Prefer exporting a
preserved legacy ID into the target. If IDs changed, provide a one-to-one
`key_map`, e.g. `{"001": "HS-101"}`. Unmapped IDs use identity matching.
Collisions between mapped and identity IDs produce `not_verified`.

Field values are unchanged unless normalizers are explicitly selected. Normalizers
run in their declared order on both sides. A source `value_map` runs after source
normalization, and its output is normalized again. Decimal comparison uses a finite
decimal number and an absolute tolerance; blanks, NaN, and unsupported number
formats produce `invalid_value`. Numeric input is limited to 38 coefficient digits
and exponents between -18 and +18. Decimal arithmetic does not perform currency conversion.

The engine detects missing/unexpected records, duplicate/empty keys, ambiguous ID
maps, changed fields, invalid decimal values, and empty datasets. Findings are
deterministically ordered. Duplicate IDs are excluded from field comparisons.
Verdicts: uncertainty takes precedence (`not_verified`), otherwise discrepancies
mean `failed`, otherwise `passed` **within the declared scope only**.

## Configuration

Copy `.env.example` to `.env` if you need overrides. All settings use the
`AUDITOR_` prefix. Defaults limit individual CSVs to 5 MiB / 25,000 data records,
200 columns, and reports to 1,000 findings. Counts still include all findings;
the report explicitly marks truncation. Evidence strings are capped at 500
characters. The immutable original file retains the complete value.

`AUDITOR_API_KEY` optionally requires an `X-API-Key` header on `/api/v1` endpoints.
Use the **Authorize** button in Swagger. This is a single-user development guard.
There are no user accounts or tenant authorization yet. Bind to localhost and use
synthetic data until the production requirements in `docs/architecture.md` are met.

## Migrations

Local defaults use SQLAlchemy `create_all` for a zero-setup first run. It does not
upgrade existing tables. To use migrations from the beginning, set
`AUDITOR_AUTO_CREATE_SCHEMA=false` and run:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

If the initial schema was already created automatically and has not been changed,
`python -m alembic stamp 0001` records that baseline. Do not stamp a different or
unknown schema. Subsequent changes use `alembic revision --autogenerate -m "..."`;
review generated migrations before applying them. Keep the domain independent of
database model changes.

## PostgreSQL and Celery with Docker

Install Docker with Linux container support, then run:

```powershell
docker compose up --build
```

The migration service applies Alembic before API and worker startup. The API is
bound to `127.0.0.1:8000`. PostgreSQL and Redis have no host ports. Uploads are shared
between API and worker using a named volume. Database credentials in Compose are
local-development defaults. Stop an existing local server before using port 8000.

For a native API with external infrastructure, install `.[dev,worker,postgres]`,
configure a PostgreSQL URL, `AUDITOR_TASK_BACKEND=celery`, and a Redis broker URL.
Run `celery -A app.workers.celery_app:celery_app worker --loglevel=info` in Linux/WSL.
Celery is optional locally and does not officially support native Windows.
API and worker must share the same settings and upload storage.

## Development checks

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

`requirements-dev.lock` records the exact tested base/development dependencies.
For a reproducible local setup: `pip install -r requirements-dev.lock`, then
`pip install --no-deps -e .`. Optional worker/PostgreSQL dependencies are declared
in `pyproject.toml`. CI checks Python 3.14 and the initial PostgreSQL migration.

The intended next milestone is cross-object relationship validation. See the
roadmap before adding AI mapping, a frontend, or direct CRM connectors.
