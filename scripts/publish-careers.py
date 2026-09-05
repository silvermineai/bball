"""Validate and publish the historical player archive. Initial D1 sync is large."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--refresh",
    action="store_true",
    help="Conditionally recheck the published source files",
)
args = parser.parse_args()


def run(arguments, cwd=ROOT):
    subprocess.run(arguments, cwd=cwd, env=ENV, check=True)


run(
    [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_careers.py",
    ]
)
run(
    [
        sys.executable,
        "-m",
        "ncaa_scraper.basketball_careers",
        "--sql",
        *(["--refresh"] if args.refresh else []),
    ]
)
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run(["npm", "run", "typecheck"], ROOT / "worker")
run(["npm", "test"], ROOT / "worker")
run([sys.executable, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([sys.executable, "scripts/sync-careers.py"])
run([sys.executable, "scripts/cloudflare.py", "deploy"])
