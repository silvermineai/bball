#!/usr/bin/env python3
"""Refresh the attributed SportsDataverse basketball standings archive."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))

from ncaa_scraper.basketball_standings import write  # noqa: E402


if __name__ == "__main__":
    release = write(refresh=True)
    print(f"Basketball standings: wrote {len(release['teams']):,} team-season records")
