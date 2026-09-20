#!/usr/bin/env python3
"""Fail publication when selected public releases are stale or malformed."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Keep this operator-facing gate runnable from a clean checkout as well as from
# the CI environment.  The scraper package is intentionally a source tree
# rather than a globally installed dependency, so importing it before adding
# the repository path makes the documented `python scripts/check-freshness.py`
# command fail locally.
sys.path.insert(0, str(ROOT / "ncaa_scraper"))

from ncaa_scraper.publication_health import check_freshness

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sport", choices=["basketball", "football", "both"], default="both")
parser.add_argument("--max-age-hours", type=float, default=240)
parser.add_argument(
    "--report-file",
    type=Path,
    help="also write the complete JSON health report to this path, including failures",
)
args = parser.parse_args()

def persist_report(report: dict) -> None:
    """Write an operator-readable report before the process exits.

    CI normally only retains stdout from a failed step.  A file report gives
    operators a durable artifact with the selected scope, checked clock,
    release rows already inspected and every failed gate, even when this
    command exits non-zero.
    """
    if args.report_file is None:
        return
    args.report_file.parent.mkdir(parents=True, exist_ok=True)
    args.report_file.write_text(json.dumps(report, indent=2) + "\n")

try:
    report = check_freshness(
        ROOT,
        args.sport,
        max_age_hours=args.max_age_hours,
    )
except ValueError as exc:
    # check_freshness serializes its aggregate failure report in the
    # exception. Preserve that structure for artifact consumers, while still
    # handling an unexpected validation error without hiding the cause.
    try:
        failed = json.loads(str(exc))
    except json.JSONDecodeError:
        failed = {
            "checked_at": None,
            "sport": args.sport,
            "max_age_hours": args.max_age_hours,
            "ok": False,
            "releases": [],
            "errors": [str(exc)],
        }
    if not isinstance(failed, dict):
        failed = {
            "checked_at": None,
            "sport": args.sport,
            "max_age_hours": args.max_age_hours,
            "ok": False,
            "releases": [],
            "errors": [str(exc)],
        }
    persist_report(failed)
    print(json.dumps(failed, indent=2))
    raise SystemExit(1) from None
persist_report(report)
print(json.dumps(report, indent=2))
