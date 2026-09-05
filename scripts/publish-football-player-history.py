"""Validate, archive, synchronize and publish historical football player records."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, env=ENV, check=True)


run([sys.executable, "-m", "ncaa_scraper.football_player_history", *sys.argv[1:]])
run(
    [
        sys.executable,
        "-m",
        "ncaa_scraper.football_events",
        "--sql",
        str(ROOT / ".local/football-events.sql"),
    ]
)
run(
    [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_football*.py",
    ]
)
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run([sys.executable, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([sys.executable, "scripts/sync-football-player-history.py"])
run([sys.executable, "scripts/sync-football-events.py"])
run([sys.executable, "scripts/cloudflare.py", "deploy"])
