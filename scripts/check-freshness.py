#!/usr/bin/env python3
"""Fail publication when selected public releases are stale or malformed."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ncaa_scraper.publication_health import check_freshness

ROOT = Path(__file__).resolve().parents[1]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sport", choices=["basketball", "football", "both"], default="both")
parser.add_argument("--max-age-hours", type=float, default=240)
args = parser.parse_args()

try:
    report = check_freshness(
        ROOT,
        args.sport,
        max_age_hours=args.max_age_hours,
    )
except ValueError as exc:
    print(str(exc))
    raise SystemExit(1) from None
print(json.dumps(report, indent=2))
