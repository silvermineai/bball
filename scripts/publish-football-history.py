"""Publish the historical efficiency extension without refreshing forecast registrations."""

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
    help="Conditionally recheck six historical source releases",
)
args = parser.parse_args()


def run(argv, cwd=ROOT):
    subprocess.run(argv, cwd=cwd, env=ENV, check=True)


for name in ("football_history", "football_efficiency", "football_artifacts"):
    run(
        [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "ncaa_scraper/tests",
            "-p",
            f"test_{name}.py",
        ]
    )
run(
    [
        sys.executable,
        "-m",
        "ncaa_scraper.football_history",
        *(["--refresh"] if args.refresh else []),
    ]
)
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run([sys.executable, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([sys.executable, "scripts/sync-football-history.py"])
run([sys.executable, "scripts/sync-football-efficiency.py"])
run([sys.executable, "scripts/cloudflare.py", "deploy"])
