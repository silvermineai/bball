"""Archive the feature experiment, its baseline, fixed design and implementation in R2."""

import fcntl
import hashlib
import json
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/data/football"
DIRECTORY = PUBLIC / "features"
LOCAL = ROOT / ".local/football-feature-archive"
LOCAL.mkdir(parents=True, exist_ok=True)
lock = (ROOT / ".local/football-features.lock").open("w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
manifest = json.loads((DIRECTORY / "manifest.json").read_text())
summary = json.loads((DIRECTORY / "summary.json").read_text())
if manifest["experiment_id"] != summary["id"]:
    raise SystemExit("Experiment manifest mismatch")
files = [(DIRECTORY / "manifest.json", "experiment/manifest.json")]
for name, sha in manifest["files"].items():
    path = DIRECTORY / name
    if path.name != name or hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        raise SystemExit("Experiment file mismatch")
    value = json.loads(path.read_text())
    if value.get("experiment_id", value.get("id")) != summary["id"]:
        raise SystemExit("Mixed experiment editions")
    files.append((path, "experiment/" + name))
for name, sha in summary["implementation_sha256"].items():
    path = ROOT / "ncaa_scraper/ncaa_scraper" / name
    if path.name != name or hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        raise SystemExit("Implementation changed; rebuild first")
    files.append((path, "implementation/" + name))
spec = ROOT / "data/research/football-efficiency-experiment.json"
if json.loads(spec.read_text()) != summary["spec"]:
    raise SystemExit("Fixed design changed")
files.append((spec, "design.json"))
base = PUBLIC / "evaluation"
if json.loads((base / "manifest.json").read_text()) != summary["base_manifest"]:
    raise SystemExit("Weekly baseline changed")
files.append((base / "manifest.json", "baseline/manifest.json"))
for name, sha in summary["base_manifest"]["files"].items():
    path = base / name
    if path.name != name or hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        raise SystemExit("Baseline file mismatch")
    files.append((path, "baseline/" + name))
bundle = LOCAL / "experiment.tar"
with tarfile.open(bundle, "w") as archive:
    for path, name in files:
        info = archive.gettarinfo(str(path), arcname=name)
        info.mtime = info.uid = info.gid = 0
        info.uname = info.gname = ""
        with path.open("rb") as stream:
            archive.addfile(info, stream)
sha = hashlib.sha256(bundle.read_bytes()).hexdigest()
key = f"bball-research/football/feature-experiments/{sha}.tar"


def run(args):
    with (LOCAL / "archive.log").open("a") as log:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/cloudflare.py"), *args],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=True,
        )


checkpoint = LOCAL / "archive.json"
previous = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
if previous.get("sha256") != sha:
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
verified = LOCAL / "verified.tar"
run(["r2", "object", "get", key, "--file", str(verified), "--remote"])
if hashlib.sha256(verified.read_bytes()).hexdigest() != sha:
    raise SystemExit("R2 round-trip mismatch")
verified.unlink()
checkpoint.write_text(
    json.dumps({"experiment_id": summary["id"], "key": key, "sha256": sha}, indent=2)
)
print(
    "Feature experiment, baseline, fixed design and implementations verified in private R2"
)
