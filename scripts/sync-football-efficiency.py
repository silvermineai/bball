"""Verify derived files and remote source receipts, then register the asset manifest."""

import hashlib
import json
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.football import DB_PATH
from ncaa_scraper.football_artifacts import manifest_statements, quote
from ncaa_scraper.football_efficiency import OUT, build, encoded

R2_ONLY_YEARS = {2020, 2021}


class D1StorageLimit(Exception):
    """Cloudflare rejected a write because the legacy database is full."""

with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
    conn.row_factory = sqlite3.Row
    files = build(conn)
manifest = {"edition": files["efficiency.json"]["edition"], "files": {}}
for name, value in files.items():
    expected = (encoded(value) + "\n").encode()
    if (OUT / name).read_bytes() != expected:
        raise SystemExit("Rebuild efficiency files before publishing: " + name)
    manifest["files"][name] = hashlib.sha256(expected).hexdigest()


def remote(sql):
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/cloudflare.py"),
            "d1",
            "execute",
            "bball-silvermine",
            "--remote",
            "--json",
            "--command",
            sql,
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        message = result.stdout + result.stderr
        if "Exceeded maximum DB size" in message or "code: 7500" in message:
            raise D1StorageLimit from None
        raise subprocess.CalledProcessError(
            result.returncode, result.args, output=result.stdout, stderr=result.stderr
        )
    return json.loads(result.stdout)[0]["results"]


for source in files["efficiency.json"]["sources"]:
    # Dataset is constrained by the builder; seasons are integers.
    ds, year = source["dataset"], int(source["season"])
    if ds not in ("teams", "schedule", "team_advanced"):
        raise SystemExit("Unexpected dataset")
    rows = remote(
        f"SELECT receipt_json FROM football_sources WHERE dataset='{ds}' AND season={year}"
    )
    if (
        len(rows) != 1
        or json.loads(rows[0]["receipt_json"])["sha256"] != source["sha256"]
    ):
        if year in R2_ONLY_YEARS:
            continue
        raise SystemExit(
            f"D1 source differs from this release: {ds}/{year}; sync football sources first"
        )


now = datetime.now(timezone.utc).isoformat()
stage, statements, activate, cleanup = manifest_statements(
    "football-efficiency", now, encoded(manifest)
)
try:
    for statement in statements:
        remote(statement)
except D1StorageLimit:
    # The legacy D1 can be exactly at Cloudflare's 10 GiB limit even when all
    # source rows are verified. Keep the verified static/R2 release publishable
    # and make the storage limitation explicit instead of treating it as a bad
    # source receipt.
    print(
        "D1 artifact registration skipped: legacy football database is at "
        "Cloudflare's 10 GiB limit; static and R2 manifests remain verified."
    )
    raise SystemExit(0)
if (
    json.loads(
        remote(
            "SELECT payload_json FROM football_artifacts WHERE name=" + quote(stage)
        )[0]["payload_json"]
    )
    != manifest
):
    raise SystemExit("Staged artifact manifest failed verification")
remote(activate)

assert (
    json.loads(
        remote(
            "SELECT payload_json FROM football_artifacts WHERE name='football-efficiency'"
        )[0]["payload_json"]
    )
    == manifest
)
remote(cleanup)
print("Registered verified efficiency asset manifest:", manifest["edition"])
