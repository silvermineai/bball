"""Archive a verified football experiment and its implementation in private R2."""

import fcntl
import hashlib
import json
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "frontend/public/data/football/evaluation"
LOCAL = ROOT / ".local/football-evaluation-research"
LOCAL.mkdir(parents=True, exist_ok=True)
lock = (ROOT / ".local/football-evaluation.lock").open("w")
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit("An evaluation build or archive is already active") from None
manifest = json.loads((DIRECTORY / "manifest.json").read_text())
summary = json.loads((DIRECTORY / "summary.json").read_text())
if manifest["signature"] != summary["id"]:
    raise SystemExit("Experiment manifest mismatch")
files = [(DIRECTORY / "manifest.json", "manifest.json")]
for name, expected in manifest["files"].items():
    path = DIRECTORY / name
    if path.name != name or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit("Experiment artifact hash mismatch")
    value = json.loads(path.read_text())
    if value.get("experiment_id", value.get("id")) != summary["id"]:
        raise SystemExit("Mixed experiment editions")
    files.append((path, name))
for name, expected in summary["implementation_sha256"].items():
    path = ROOT / "ncaa_scraper/ncaa_scraper" / name
    if path.name != name or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit("Experiment implementation has changed; rebuild first")
    files.append((path, "implementation/" + name))
bundle = LOCAL / "experiment.tar"
with tarfile.open(bundle, "w") as archive:
    for path, name in files:
        info = archive.gettarinfo(str(path), arcname=name)
        info.mtime = info.uid = info.gid = 0
        info.uname = info.gname = ""
        with path.open("rb") as contents:
            archive.addfile(info, contents)
sha = hashlib.sha256(bundle.read_bytes()).hexdigest()
key = f"bball-research/football/experiments/{sha}.tar"


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
download = LOCAL / "experiment-verified.tar"
run(["r2", "object", "get", key, "--file", str(download), "--remote"])
if hashlib.sha256(download.read_bytes()).hexdigest() != sha:
    raise SystemExit("R2 round-trip hash mismatch")
download.unlink()
checkpoint.write_text(
    json.dumps({"experiment_id": summary["id"], "key": key, "sha256": sha}, indent=2)
)
print("Experiment artifacts and implementation verified in private R2", flush=True)
