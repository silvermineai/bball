"""Refresh shot evidence, test, archive sources, sync D1 and publish the lab."""

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
        "test_basketball_shooting.py",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.basketball_shooting",
        "--seasons",
        "2024",
        "2025",
        "2026",
        "--refresh",
        "--sql",
    ]
)
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run(["npm", "run", "typecheck"], ROOT / "worker")
run(["npm", "test"], ROOT / "worker")
run([PY, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([PY, "scripts/sync-shooting.py"])
run([PY, "scripts/cloudflare.py", "deploy"])
