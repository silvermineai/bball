"""Register current forecasts, optionally capture market quotes, publish the scorecard.

Refresh either sport first to collect newer schedules/results. --odds performs
at most one call per in-season sport through an already-configured account;
--espn-lines captures bounded prospective public ESPN summaries for both sports.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--sport",
    choices=("basketball", "football", "both"),
    default="both",
    help="limit source capture to the warehouse refreshed by this run",
)
parser.add_argument("--odds", action="store_true")
parser.add_argument("--cbbd-lines", action="store_true", help="capture authorized CBBD pregame moneylines")
parser.add_argument("--espn-lines", action="store_true", help="capture prospective ESPN pickcenter quotes for basketball and football")
parser.add_argument("--espn-schedule", action="store_true", help="capture bounded public ESPN basketball schedule-clock observations")
args = parser.parse_args()


def run(command, cwd=ROOT):
    subprocess.run(command, cwd=cwd, env=ENV, check=True)


def run_espn_capture(command, label: str) -> bool:
    """Run an ESPN capture, retaining the previous ledger on policy failure.

    The collectors fail closed before any API request when the exact ESPN API
    origin's robots policy cannot be verified. A scheduled publication should
    continue with the prior receipt-backed market/schedule observations in
    that case; unrelated source refreshes and model publication still need to
    reach the site. Other collector failures remain fatal.
    """
    result = subprocess.run(command, cwd=ROOT, env=ENV, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    if result.returncode == 0:
        return True
    output = f"{result.stdout}\n{result.stderr}"
    if re.search(r"ESPN robots(?:\.txt| policy)|Cannot verify ESPN robots|no page requested|disallows this request", output, re.IGNORECASE):
        print(f"::warning::{label} ESPN robots policy could not be verified; retaining the prior receipt-backed capture.", file=sys.stderr)
        return False
    raise subprocess.CalledProcessError(result.returncode, command)


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
    run([PY, "-m", "ncaa_scraper.odds_feed", "--sport", args.sport])
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
if (args.espn_schedule or args.espn_lines) and args.sport in ("basketball", "both"):
    # Capture the source clock in the same bounded run as pickcenter quotes.
    # Observations remain separate from canonical games and registrations.
    if run_espn_capture([PY, "-m", "ncaa_scraper.espn_schedule", "--season", "2027"], "ESPN basketball schedule capture"):
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
    if args.sport in ("basketball", "both"):
        # Inspect a broad but bounded slice of the upcoming slate. ESPN often
        # publishes basketball markets close to tip; retaining the explicit
        # bound makes the request cost auditable while avoiding a small fixed
        # prefix that can leave later games unobserved during preseason.
        if run_espn_capture([PY, "-m", "ncaa_scraper.espn_pickcenter", "--season", "2027", "--limit", "300"], "ESPN basketball market capture"):
            run(
                [
                    PY,
                    "-m",
                    "ncaa_scraper.research_ledger",
                    "--sql",
                    str(ROOT / ".local/research-ledger.sql"),
                ]
            )
    if args.sport in ("football", "both"):
        if run_espn_capture([PY, "-m", "ncaa_scraper.espn_football_pickcenter", "--season", "2026"], "ESPN football market capture"):
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
