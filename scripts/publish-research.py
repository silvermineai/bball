"""Register current forecasts, optionally capture licensed odds, publish the scorecard.

Refresh either sport first to collect newer schedules/results. --odds performs
at most one call per in-season sport through an already-configured account.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--odds", action="store_true")
args = parser.parse_args()


def run(command, cwd=ROOT):
    subprocess.run(command, cwd=cwd, env=ENV, check=True)


run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_research_ledger.py",
    ]
)
# Registration precedes odds capture so pregame comparisons have a stable origin.
run(
    [
        PY,
        "-m",
        "ncaa_scraper.research_ledger",
        "--sql",
        str(ROOT / ".local/research-ledger.sql"),
    ]
)
if args.odds:
    run([PY, "-m", "ncaa_scraper.odds_feed", "--sport", "both"])
    run(
        [
            PY,
            "-m",
            "ncaa_scraper.research_ledger",
            "--sql",
            str(ROOT / ".local/research-ledger.sql"),
        ]
    )
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run(["npm", "run", "typecheck"], ROOT / "worker")
run(["npm", "test"], ROOT / "worker")
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/cloudflare.py", "deploy"])
