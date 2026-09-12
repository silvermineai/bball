"""Register current forecasts, optionally capture market quotes, publish the scorecard.

Refresh either sport first to collect newer schedules/results. --odds performs
at most one call per in-season sport through an already-configured account;
--espn-lines captures bounded prospective public ESPN summaries for basketball.
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
parser.add_argument("--cbbd-lines", action="store_true", help="capture authorized CBBD pregame moneylines")
parser.add_argument("--espn-lines", action="store_true", help="capture prospective ESPN basketball pickcenter quotes")
parser.add_argument("--espn-schedule", action="store_true", help="capture bounded public ESPN basketball schedule-clock observations")
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
if args.cbbd_lines:
    run([PY, "-m", "ncaa_scraper.cbbd_lines", "--season", "2027"])
    run(
        [
            PY,
            "-m",
            "ncaa_scraper.research_ledger",
            "--sql",
            str(ROOT / ".local/research-ledger.sql"),
        ]
    )
if args.espn_schedule or args.espn_lines:
    # Capture the source clock in the same bounded run as pickcenter quotes.
    # Observations remain separate from canonical games and registrations.
    run([PY, "-m", "ncaa_scraper.espn_schedule", "--season", "2027"])
    run(
        [
            PY,
            "-m",
            "ncaa_scraper.research_ledger",
            "--sql",
            str(ROOT / ".local/research-ledger.sql"),
        ]
    )
if args.espn_lines:
    run([PY, "-m", "ncaa_scraper.espn_pickcenter", "--season", "2027"])
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
