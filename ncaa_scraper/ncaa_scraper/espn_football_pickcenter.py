"""Capture prospective ESPN pickcenter quotes for scheduled college football games.

ESPN's public summary response uses the same pickcenter market shape as the
basketball endpoint.  This collector keeps football observations in the
append-only research ledger, with exact event/team identities and a capture
clock.  It never replays completed games or invents a provider update clock.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import requests

from .espn_pickcenter import MAX_RESPONSE_BYTES, REQUEST_DELAY_SECONDS, parse_pickcenter
from .football_sources import ROOT, utcnow
from .odds_feed import schedules
from .research_ledger import connect, digest, encoded, timestamp

PROVIDER = "ESPN Summary"
SPORT = "football"
BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary"
DOCS_URL = "https://www.espn.com/college-football/"
CACHE = ROOT / ".local/odds"
DEFAULT_HORIZON_DAYS = 60


def _future_games(games: list[dict], season: int, horizon_days: int, now: datetime) -> list[dict]:
    if not 1 <= horizon_days <= 90:
        raise ValueError("horizon_days must be between 1 and 90")
    until = now + timedelta(days=horizon_days)
    return [
        game for game in games
        if game["season"] == season
        and not game["completed"]
        and not game["time_tbd"]
        and now < datetime.fromisoformat(game["starts_at"].replace("Z", "+00:00")) <= until
    ]


def fetch_upcoming(season: int = 2026, horizon_days: int = DEFAULT_HORIZON_DAYS, limit: int = 120) -> tuple[list[dict], dict]:
    if not 1 <= limit <= 300:
        raise ValueError("limit must be between 1 and 300")
    now = datetime.now(timezone.utc)
    games = _future_games(schedules(SPORT), season, horizon_days, now)[:limit]
    captured = now.isoformat(timespec="microseconds").replace("+00:00", "Z")
    summaries: list[dict] = []
    CACHE.mkdir(parents=True, exist_ok=True)
    for index, game in enumerate(games):
        if index:
            time.sleep(REQUEST_DELAY_SECONDS)
        event_id = str(game["id"])
        url = f"{BASE_URL}?event={event_id}"
        try:
            with requests.get(
                url,
                headers={"Accept": "application/json", "User-Agent": "SilvermineResearch/1.0 (bball.silvermine.dev)"},
                timeout=(5, 15),
                stream=True,
                allow_redirects=False,
            ) as response:
                if response.status_code != 200:
                    continue
                chunks: list[bytes] = []
                size = 0
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        chunks = []
                        break
                    chunks.append(chunk)
                if not chunks:
                    continue
                body = b"".join(chunks)
                summary = json.loads(body.decode("utf-8"))
                if not isinstance(summary, dict):
                    continue
                (CACHE / f"espn-football-summary-{event_id}.json").write_bytes(body)
                summaries.append({"event_id": event_id, "summary": summary, "url": url})
        except (requests.RequestException, ValueError, json.JSONDecodeError):
            continue
    receipt = {
        "provider": PROVIDER,
        "sport": SPORT,
        "season": season,
        "captured_at": captured,
        "horizon_days": horizon_days,
        "event_ids": [item["event_id"] for item in summaries],
        "urls": [item["url"] for item in summaries],
        "timing_basis": "summary_capture",
        "sha256": digest(summaries),
    }
    return summaries, receipt


def ingest(conn: sqlite3.Connection, summaries: list[dict], receipt: dict, games: list[dict], now: str) -> dict[str, int]:
    captured = timestamp(receipt["captured_at"])
    receipt_id = digest(receipt)
    conn.execute(
        "INSERT OR IGNORE INTO audit_receipts VALUES (?,?,?,?)",
        (receipt_id, captured, PROVIDER, encoded(receipt)),
    )
    by_id = {str(game["id"]): game for game in games}
    accepted = rejected = 0
    for item in summaries:
        try:
            event_id = str(item["event_id"])
            game = by_id[event_id]
            for bookmaker, market, updated, payload in parse_pickcenter(item["summary"], game, captured, receipt_id):
                # Football schedules live in the dedicated FOOTBALL_DB. Keep
                # bounded display context in the ledger payload so the public
                # market archive can read these rows without a cross-D1 join.
                payload = {
                    **payload,
                    "season": int(game["season"]),
                    "home_name": str(game.get("home_name") or game["home_id"]),
                    "away_name": str(game.get("away_name") or game["away_id"]),
                }
                key = digest([SPORT, game["id"], PROVIDER, bookmaker, market, captured, payload])
                conn.execute(
                    "INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)",
                    (key, SPORT, game["id"], PROVIDER, bookmaker, market, captured, updated, encoded(payload)),
                )
                accepted += 1
        except (KeyError, TypeError, ValueError):
            rejected += 1
    conn.commit()
    return {"accepted_markets": accepted, "rejected_records": rejected}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--horizon-days", type=int, default=DEFAULT_HORIZON_DAYS)
    parser.add_argument("--limit", type=int, default=120)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        summaries, receipt = fetch_upcoming(args.season, args.horizon_days, args.limit)
        result = ingest(connect(), summaries, receipt, schedules(SPORT), timestamp(utcnow()))
    except (RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps({**result, "summaries": len(summaries)}, indent=2))


if __name__ == "__main__":
    main()
