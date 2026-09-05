"""Publish generated event editions and activate them after their records exist."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if not (ROOT / ".local/football-events.sql").is_file():
    raise SystemExit("Build the football event notebook before syncing it.")
for file in ["migrations/0014_football_events.sql", "../.local/football-events.sql"]:
    with (ROOT / ".local/football-events-sync.log").open("a") as log:
        subprocess.run(
            [
                sys.executable,
                "scripts/cloudflare.py",
                "d1",
                "execute",
                "bball-silvermine",
                "--remote",
                "--file",
                file,
            ],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=True,
        )
subprocess.run(
    [sys.executable, str(ROOT / "scripts/verify-football-events.py")],
    cwd=ROOT,
    check=True,
)
print("Football event editions synced and verified in Cloudflare D1")
