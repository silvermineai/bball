#!/usr/bin/env python3
"""Refresh the permitted ESPN college basketball RSS context feed."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))

from ncaa_scraper.news_rss import write_release  # noqa: E402


if __name__ == "__main__":
    release = write_release()
    print(f"ESPN RSS: wrote {len(release['articles'])} basketball headlines")
