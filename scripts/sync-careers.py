"""Archive verified sources in R2, then activate complete D1 historical seasons."""
import os

import argparse
import hashlib
import json
import subprocess
import sys
import tarfile
from pathlib import Path

D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.basketball_careers import acquire_lock, batch_is_current, digest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--resume",
    action="store_true",
    help="Resume a confirmed stopped sync using its matching manifest checkpoint",
)
args = parser.parse_args()
directory = ROOT / ".local/careers-sql"
sync_lock = acquire_lock(directory)
catalog = json.loads(
    (ROOT / "frontend/public/data/basketball/history/index.json").read_text()
)
manifest = json.loads((directory / "manifest.json").read_text())
if digest(catalog) != manifest["catalog_sha256"]:
    raise SystemExit("Catalog differs from SQL export manifest")
files = sorted(directory.glob("careers-*.sql"))
if [p.name for p in files] != [p["name"] for p in manifest["files"]]:
    raise SystemExit("SQL batch set differs from manifest")
for path, record in zip(files, manifest["files"]):
    if hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
        raise SystemExit("SQL batch hash mismatch")
source_files = []
for sources in catalog["sources"]:
    for source in sources:
        path = ROOT / ".local/basketball" / source["url"].rsplit("/", 1)[-1]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise SystemExit("Historical source hash mismatch")
        source_files.extend([path, Path(str(path) + ".receipt.json")])
for name, expected in manifest.get("indexes", {}).items():
    path = ROOT / "frontend/public/data/basketball/history" / name
    if path.name != name or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit("Annual index hash mismatch")
# Validate derivative annual indexes as well as the public catalog.
for season in catalog["seasons"]:
    path = (
        ROOT
        / f"frontend/public/data/basketball/history/players-{season['season']}.json"
    )
    data = json.loads(path.read_text())
    if data["edition"] != season["edition"] or data["coverage"] != season:
        raise SystemExit("Annual index edition/coverage mismatch")
checkpoint_path = directory / "sync-progress.json"
checkpoint = (
    json.loads(checkpoint_path.read_text())
    if args.resume and checkpoint_path.exists()
    else {}
)
if checkpoint.get("manifest") != digest(manifest):
    checkpoint = {"manifest": digest(manifest), "completed": []}
log_path = directory / "sync.log"


def run(arguments):
    with log_path.open("a") as log:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/cloudflare.py"), *arguments],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=True,
        )


def save():
    checkpoint_path.write_text(json.dumps(checkpoint, indent=2))


run(
    [
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        str(ROOT / "worker/migrations/0013_basketball_careers.sql"),
    ]
)
result = subprocess.run(
    [
        sys.executable,
        str(ROOT / "scripts/cloudflare.py"),
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--command",
        "SELECT season,edition FROM bb_career_seasons",
        "--json",
    ],
    cwd=ROOT,
    capture_output=True,
    text=True,
    check=True,
)
active = {
    str(row["season"]): row["edition"]
    for response in json.loads(result.stdout)
    for row in response["results"]
}
if all(active.get(str(s["season"])) == s["edition"] for s in catalog["seasons"]):
    print(
        "All remote historical editions are current; no archive or SQL upload needed",
        flush=True,
    )
    raise SystemExit(0)

if not checkpoint.get("archive_key"):
    bundle = directory / "career-sources.tar"
    with tarfile.open(bundle, "w") as archive:
        for path in source_files:
            archive.add(path, arcname=path.name)
    archive_hash = hashlib.sha256(bundle.read_bytes()).hexdigest()
    key = f"bball-research/basketball/history/{archive_hash}.tar"
    run(
        [
            "r2",
            "object",
            "put",
            key,
            "--file",
            str(bundle),
            "--content-type",
            "application/x-tar",
            "--remote",
        ]
    )
    checkpoint["archive_key"] = key
    checkpoint["archive_sha256"] = archive_hash
    save()
    print("Historical source files and receipts archived in private R2", flush=True)
for index, path in enumerate(files):
    if batch_is_current(manifest["files"][index], active):
        continue
    if path.name in checkpoint["completed"]:
        continue
    run(["d1", "execute", D1_DB_NAME, "--remote", "--file", str(path)])
    checkpoint["completed"].append(path.name)
    save()
    print(f"Historical D1 batch {index + 1}/{len(files)} imported", flush=True)
print("All historical season editions activated", flush=True)
