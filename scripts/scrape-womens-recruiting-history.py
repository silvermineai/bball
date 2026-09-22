"""Capture a bounded multi-season ESPN women's basketball recruiting history.

Each class remains an independent source release.  The history document is
only an index of those releases; it does not join prospects across classes or
fill missing ranks, destinations, or statuses.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
_capture_spec = importlib.util.spec_from_file_location("scrape_womens_recruiting", ROOT / "scripts/scrape-womens-recruiting.py")
assert _capture_spec and _capture_spec.loader
_capture_module = importlib.util.module_from_spec(_capture_spec)
_capture_spec.loader.exec_module(_capture_module)
capture = _capture_module.capture

DEFAULT_OUTPUT = ROOT / "frontend/public/data/basketball/womens-recruiting-history.json"
DEFAULT_SEASONS = (2025, 2026, 2027, 2028, 2029)


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(compact(value).encode("utf-8")).hexdigest()


def parse_seasons(value: str) -> tuple[int, ...]:
    """Parse unique class years while keeping the capture bounded."""
    try:
        seasons = tuple(sorted({int(item.strip()) for item in value.split(",") if item.strip()}))
    except ValueError as error:
        raise ValueError("women's recruiting seasons must be comma-separated integers") from error
    if not seasons or any(season < 2025 or season > 2035 for season in seasons):
        raise ValueError("women's recruiting seasons must be between 2025 and 2035")
    if len(seasons) > 8:
        raise ValueError("women's recruiting history is limited to eight classes per capture")
    return seasons


def build_history(
    seasons: tuple[int, ...] = DEFAULT_SEASONS,
    capture_fn: Callable[[int, int], dict] = capture,
) -> dict:
    """Capture each requested class and reconcile aggregate coverage counts."""
    normalized = tuple(sorted(set(seasons)))
    if not normalized or any(season < 2025 or season > 2035 for season in normalized) or len(normalized) > 8:
        raise ValueError("women's recruiting history seasons are outside the bounded range")
    releases = [capture_fn(season, 8) for season in normalized]
    for season, release in zip(normalized, releases):
        if release.get("sport") != "basketball" or release.get("gender") != "women" or release.get("season") != season:
            raise ValueError("women's recruiting history contains a mismatched class release")
        if not isinstance(release.get("records"), list) or not release["records"]:
            raise ValueError("women's recruiting history contains an empty class release")
    coverage = {
        "seasons": len(releases),
        "prospects": sum(int(release["coverage"]["prospects"]) for release in releases),
        "graded": sum(int(release["coverage"]["graded"]) for release in releases),
        "ranked": sum(int(release["coverage"]["ranked"]) for release in releases),
        "committed": sum(int(release["coverage"]["committed"]) for release in releases),
    }
    return {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "classes": [release["season"] for release in releases],
        "edition": digest([release["edition"] for release in releases]),
        "captured_at": max(release["captured_at"] for release in releases),
        "coverage": coverage,
        "releases": releases,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", default=','.join(str(season) for season in DEFAULT_SEASONS))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    history = build_history(parse_seasons(args.seasons))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "edition": history["edition"], "coverage": history["coverage"]}, indent=2))


if __name__ == "__main__":
    main()
