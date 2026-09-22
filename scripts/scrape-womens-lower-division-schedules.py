"""Capture NCAA women's DII/DIII basketball schedule calendars and contests.

The NCAA page embeds persisted queries with an explicit sport and division.
This script stores response hashes and retains the exact division on every
normalized row.  It intentionally does not map team names to ESPN IDs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# The scraper package lives one level below the repository root when this
# script is invoked directly from ``python3 scripts/...``.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))

from ncaa_scraper.womens_lower_schedule import (
    CONTEST_HASH,
    CONTEST_META,
    SCHEDULE_HASH,
    SCHEDULE_META,
    SCOREBOARD_URL,
    contest_query_url,
    parse_contests,
    parse_schedule_calendar,
    schedule_query_url,
)
from ncaa_scraper.fetcher import NCAAFetchError, verify_robots_policy

DEFAULT_OUTPUT = ROOT / "frontend/public/data/basketball/womens-lower-division-schedules.json"
USER_AGENT = "SilvermineResearch/1.0 (service@silvermineai.com)"


def fetch(session: requests.Session, url: str, receipts: list[dict], delay: float) -> dict:
    if delay > 0:
        time.sleep(delay)
    response = session.get(url, timeout=45)
    response.raise_for_status()
    body = response.content
    receipts.append({"url": url, "status": response.status_code, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
    value = response.json()
    if not isinstance(value, dict):
        raise RuntimeError(f"NCAA API returned a non-object response: {url}")
    return value


def capture(season_year: int, divisions: list[int], months: list[int], delay: float = 0.25) -> dict:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json", "Origin": "https://www.ncaa.com", "Referer": "https://www.ncaa.com/"})
    first_url = schedule_query_url(season_year, divisions[0], months[0])
    robots = verify_robots_policy(session, first_url, USER_AGENT)
    effective_delay = max(delay, float(robots.get("crawl_delay_seconds") or 0))
    receipts: list[dict] = []
    calendar: list[dict] = []
    contests: list[dict] = []
    for division in divisions:
        for month in months:
            payload = fetch(session, schedule_query_url(season_year, division, month), receipts, effective_delay)
            days = parse_schedule_calendar(payload, division)
            calendar.extend(days)
            for day in days:
                payload = fetch(session, contest_query_url(season_year, division, day["contest_date"]), receipts, effective_delay)
                contests.extend(parse_contests(payload, division, season_year, day["contest_date"]))
    contests.sort(key=lambda row: (row["contest_date"], row["division"], row["contest_id"]))
    calendar.sort(key=lambda row: (row["contest_date"], row["division"]))
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {
            "publisher": "NCAA.com",
            "scoreboard_urls": [SCOREBOARD_URL.format(division=f"d{division}") for division in divisions],
            "api_url": "https://sdataprod.ncaa.com",
            "method": "Persisted NCAA scoreboard queries with sportCode=WBB and explicit division=2 or 3; response SHA-256 receipts are retained.",
            "season_year": season_year,
            "query_contract": {"schedule": {"meta": SCHEDULE_META, "sha256": SCHEDULE_HASH}, "contests": {"meta": CONTEST_META, "sha256": CONTEST_HASH}},
            "robots_policy": robots,
            "identity_limit": "Contest IDs and publisher team slugs are retained; no name-only join to another provider is performed.",
        },
        "calendar": calendar,
        "contests": contests,
        "receipts": receipts,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season-year", type=int, required=True, help="NCAA seasonYear query value, e.g. 2025 for the 2025-26 season")
    parser.add_argument("--division", type=int, action="append", choices=(2, 3), dest="divisions", help="Repeat for D2/D3; defaults to both")
    parser.add_argument("--month", type=int, action="append", choices=range(1, 13), dest="months", help="Repeat to limit months; defaults to all")
    parser.add_argument("--delay", type=float, default=0.25)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        artifact = capture(args.season_year, args.divisions or [2, 3], args.months or list(range(1, 13)), max(0.0, args.delay))
    except NCAAFetchError as exc:
        raise SystemExit(str(exc)) from exc
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {args.output} ({len(artifact['contests']):,} contest rows, {len(artifact['receipts']):,} receipts)")


if __name__ == "__main__":
    main()
