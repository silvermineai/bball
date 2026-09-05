"""Validate, archive and publish the fixed historical efficiency experiment."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, env=ENV, check=True)


run([sys.executable, "-m", "ncaa_scraper.football_features"])
run(
    [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_football_features.py",
    ]
)
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run([sys.executable, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([sys.executable, "scripts/archive-football-features.py"])
run([sys.executable, "scripts/cloudflare.py", "deploy"])
