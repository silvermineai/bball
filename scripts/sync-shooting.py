"""Archive the attributed PBP file in R2 and activate a complete D1 shot edition."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

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
run(
    [
        "d1",
        "execute",
        "bball-silvermine",
        "--remote",
        "--file",
        "migrations/0011_basketball_shooting.sql",
    ]
)
for i, path in enumerate(files):
    run(["d1", "execute", "bball-silvermine", "--remote", "--file", str(path)])
    print(f"D1 shooting batch {i + 1}/{len(files)} imported", flush=True)
print("Complete shooting edition activated", flush=True)
