"""Archive the attributed PBP file in R2 and activate a complete D1 shot edition."""
import os

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from sql_batches import is_retryable_d1_import_error

D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
catalog_path = ROOT / "frontend/public/data/basketball/shooting-catalog.json"
if catalog_path.exists():
    catalog = json.loads(catalog_path.read_text())
    catalogs = catalog["seasons"]
else:
    catalog = json.loads((ROOT / "frontend/public/data/basketball/shooting.json").read_text())
    catalogs = [catalog]
pbp_catalog_path = ROOT / "frontend/public/data/basketball/pbp-catalog.json"
pbp_catalogs = (
    json.loads(pbp_catalog_path.read_text())["seasons"]
    if pbp_catalog_path.exists()
    else catalogs
)
files = sorted((ROOT / ".local/shooting-sql").glob("shots-*.sql"))
if not files:
    raise SystemExit("Generate the shooting SQL before syncing")
manifest = json.loads((ROOT / ".local/shooting-sql/manifest.json").read_text())
if [p.name for p in files] != [p["name"] for p in manifest["files"]]:
    raise SystemExit("SQL batch set differs from the export manifest")
for path, expected in zip(files, manifest["files"]):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected["sha256"]:
        raise SystemExit("SQL content differs from the export manifest")
log_path = ROOT / ".local/shooting-sync.log"


def run(args):
    with log_path.open("a") as log:
        subprocess.run(
            [PY, "scripts/cloudflare.py", *args],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=True,
        )


def run_remote_d1(args):
    """Run one D1 request with safe retries for transient Wrangler failures.

    D1 imports can commit while Wrangler loses its polling response (or while
    Cloudflare resets the import).  A successful receipt is authoritative; a
    replay is only attempted for the retryable markers shared by the other
    bounded importers.
    """
    retry_delays = (15, 30, 60, 120, 180)
    command = [PY, "scripts/cloudflare.py", *args]
    for attempt in range(1, len(retry_delays) + 2):
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
        output = (result.stdout or "") + (result.stderr or "")
        with log_path.open("a") as log:
            log.write(
                f"\nD1 request (attempt {attempt}/{len(retry_delays) + 1}): "
                f"{' '.join(args)}\n{output}\n"
            )
        output = "\n".join(output.splitlines()[-100:])
        completed_receipt = (
            '"success"' in output
            and '"finalBookmark"' in output
            and ("Processed " in output or "Executed " in output)
        )
        completed_status_stream = (
            "Not currently importing anything" in output
            and "Processed " in output
            and "D1 DB storage operation exceeded timeout" not in output
        )
        if result.returncode == 0 or completed_receipt or completed_status_stream:
            if result.returncode != 0:
                print(
                    "D1 shooting import returned a committed receipt despite "
                    "Wrangler exit status 1; continuing.",
                    file=sys.stderr,
                )
            return
        if attempt < len(retry_delays) + 1 and is_retryable_d1_import_error(output):
            delay = retry_delays[attempt - 1]
            print(
                "D1 shooting import hit a transient Cloudflare error "
                f"(attempt {attempt}/{len(retry_delays) + 1}); retrying in {delay} seconds.",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(delay)
            continue
        print("D1 shooting import failed; last log lines:", file=sys.stderr)
        print(output, file=sys.stderr)
        raise subprocess.CalledProcessError(result.returncode, command)


for season_catalog in pbp_catalogs:
    season = season_catalog["season"]
    receipt = season_catalog["source"]
    source = ROOT / f".local/basketball/play_by_play_{season}.parquet"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != receipt["sha256"]:
        raise SystemExit(f"Source receipt mismatch for {season}; refusing archive upload")
    key = f"bball-research/basketball/pbp/{season}/{digest}"
    run(
        [
            "r2",
            "object",
            "put",
            key + ".parquet",
            "--file",
            str(source),
            "--content-type",
            "application/vnd.apache.parquet",
            "--remote",
        ]
    )
    run(
        [
            "r2",
            "object",
            "put",
            key + ".receipt.json",
            "--file",
            str(source) + ".receipt.json",
            "--content-type",
            "application/json",
            "--remote",
        ]
    )
    print(f"Attributed {season} PBP source and receipt archived in R2", flush=True)
if "seasons" in manifest:
    if sorted(manifest["seasons"]) != sorted(c["season"] for c in catalogs):
        raise SystemExit("SQL and public shooting season sets differ; rebuild shooting first")
    editions = {str(c["season"]): c["coverage"]["edition"] for c in catalogs}
    if manifest["editions"] != editions:
        raise SystemExit("SQL and public shooting editions differ; rebuild shooting first")
else:
    only = catalogs[0]
    if manifest["edition"] != only["coverage"]["edition"] or manifest["season"] != only["season"]:
        raise SystemExit("SQL and public data editions differ; rebuild shooting first")
run_remote_d1(
    [
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0011_basketball_shooting.sql",
    ]
)
for i, path in enumerate(files):
    run_remote_d1(["d1", "execute", D1_DB_NAME, "--remote", "--file", str(path)])
    print(f"D1 shooting batch {i + 1}/{len(files)} imported", flush=True)
print("Complete shooting edition activated", flush=True)
