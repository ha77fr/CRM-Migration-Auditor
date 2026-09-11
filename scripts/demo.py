"""Run after starting the API: python scripts/demo.py [--base-url http://127.0.0.1:8000]."""

import argparse
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--api-key", default=os.getenv("AUDITOR_API_KEY", ""))
    args = parser.parse_args()
    # Respect .env when the installed project is available.
    if not args.api_key:
        from app.core.config import Settings

        args.api_key = Settings().api_key.get_secret_value()

    def call(method, path, payload=None, file_path=None):
        headers = {"Accept": "application/json", "X-API-Key": args.api_key}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        if file_path is not None:
            boundary = uuid4().hex
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            data = (
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
                    f'filename="{file_path.name}"\r\nContent-Type: text/csv\r\n\r\n'
                ).encode()
                + file_path.read_bytes()
                + f"\r\n--{boundary}--\r\n".encode()
            )
        request = Request(args.base_url.rstrip("/") + path, data, headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            raise SystemExit(f"API returned {exc.code}: {exc.read().decode()}") from None

    project = call("POST", "/api/v1/projects", {"name": "Synthetic migration demo"})
    base = f"/api/v1/projects/{project['id']}"
    source = call("POST", base + "/datasets?side=source", file_path=EXAMPLES / "source.csv")
    target = call("POST", base + "/datasets?side=target", file_path=EXAMPLES / "target.csv")
    audit = call(
        "POST",
        base + "/audits",
        {
            "source_dataset_id": source["id"],
            "target_dataset_id": target["id"],
            "contract": json.loads((EXAMPLES / "contract.json").read_text()),
        },
    )
    audit_path = base + f"/audits/{audit['id']}"
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        audit = call("GET", audit_path)
        if audit["status"] == "completed":
            print(json.dumps(call("GET", audit_path + "/report"), indent=2))
            return
        if audit["status"] == "failed":
            raise SystemExit(f"Execution failed: {audit['error_code']}")
        time.sleep(0.25)
    raise SystemExit(f"Audit is still {audit['status']}; poll {audit_path} later")


if __name__ == "__main__":
    main()
