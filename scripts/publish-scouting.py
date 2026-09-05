"""Rebuild basketball scouting from the current model/data edition, verify and publish."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, env=ENV, check=True)


run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_scouting.py",
    ]
)
run([PY, "-m", "ncaa_scraper.basketball_scouting"])
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run(["npm", "run", "typecheck"], ROOT / "worker")
run(["npm", "test"], ROOT / "worker")
run([PY, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([PY, "scripts/cloudflare.py", "deploy"])
