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

from .espn_pickcenter import (
    MAX_RESPONSE_BYTES,
    REQUEST_DELAY_SECONDS,
    american_to_decimal,
    numeric_line,
    parse_pickcenter,
    summary_capture_counts,
    validate_identity,
)
from .football_sources import ROOT, utcnow
from .odds_feed import schedules
from .research_ledger import connect, digest, encoded, timestamp
from .espn_robots import DEFAULT_USER_AGENT, verify_robots_policy

PROVIDER = "ESPN Summary"
SPORT = "football"
BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary"
DOCS_URL = "https://www.espn.com/college-football/"
CACHE = ROOT / ".local/odds"
DEFAULT_HORIZON_DAYS = 60
USER_AGENT = DEFAULT_USER_AGENT


def _flattened_pickcenter(summary: dict, game: dict, captured_at: str, receipt_id: str) -> list[tuple[str, str, str, dict]]:
    """Parse the flattened football pickcenter shape used by current ESPN summaries.

    Football summaries publish one signed home spread, one total, and team
    odds directly on each pick rather than the nested ``close`` objects used
    by the basketball endpoint. The source has no quote-update clock, so the
    capture clock is retained as the update boundary, as in the existing
    collector. Every market still requires exact event, participant, and
    pregame checks before it can enter the ledger.
    """
    start, event_id, source_time_valid = validate_identity(summary, game)
    captured = timestamp(captured_at)
    if start <= captured:
        raise ValueError("Game already started at capture")
    picks = summary.get("pickcenter")
    if not isinstance(picks, list):
        raise ValueError("Missing pickcenter")
    rows: list[tuple[str, str, str, dict]] = []
    for pick in picks:
        if not isinstance(pick, dict):
            continue
        provider = pick.get("provider")
        bookmaker = str(provider.get("name", "")).strip() if isinstance(provider, dict) else ""
        home_odds = pick.get("homeTeamOdds")
        away_odds = pick.get("awayTeamOdds")
        if (
            not bookmaker
            or len(bookmaker) > 100
            or not isinstance(home_odds, dict)
            or not isinstance(away_odds, dict)
            or str(home_odds.get("teamId", "")) != str(game["home_id"])
            or str(away_odds.get("teamId", "")) != str(game["away_id"])
        ):
            continue
        base = {
            "home_id": game["home_id"],
            "away_id": game["away_id"],
            "starts_at": start,
            "event_id": event_id,
            "receipt_id": receipt_id,
            "canonical_time_tbd": bool(game.get("time_tbd")),
            "source_time_valid": source_time_valid,
        }
        # A provider can publish a spread or total while its moneyline is
        # unavailable. Keep each complete market independently.
        try:
            rows.append((
                bookmaker,
                "h2h",
                captured,
                {
                    **base,
                    "line": None,
                    "home_price": american_to_decimal(home_odds["moneyLine"]),
                    "away_price": american_to_decimal(away_odds["moneyLine"]),
                },
            ))
        except (KeyError, TypeError, ValueError):
            pass
        try:
            spread = numeric_line(pick["spread"])
            if abs(spread) > 1000:
                raise ValueError("Invalid spread")
            rows.append((
                bookmaker,
                "spreads",
                captured,
                {
                    **base,
                    "line": spread,
                    "home_price": american_to_decimal(home_odds["spreadOdds"]),
                    "away_price": american_to_decimal(away_odds["spreadOdds"]),
                },
            ))
        except (KeyError, TypeError, ValueError):
            pass
        try:
            total = numeric_line(pick["overUnder"])
            if total < 0:
                raise ValueError("Invalid total")
            rows.append((
                bookmaker,
                "totals",
                captured,
                {
                    **base,
                    "line": total,
                    "over_price": american_to_decimal(pick["overOdds"]),
                    "under_price": american_to_decimal(pick["underOdds"]),
                },
            ))
        except (KeyError, TypeError, ValueError):
            pass
    if not rows:
        raise ValueError("No complete current football pickcenter markets")
    return rows


def parse_football_pickcenter(summary: dict, game: dict, captured_at: str, receipt_id: str) -> list[tuple[str, str, str, dict]]:
    """Parse either the shared nested shape or ESPN's flattened football shape."""
    try:
        return parse_pickcenter(summary, game, captured_at, receipt_id)
    except ValueError as nested_error:
        try:
            return _flattened_pickcenter(summary, game, captured_at, receipt_id)
        except ValueError:
            # Preserve the useful nested parser error for callers that passed
            # a malformed response rather than a flattened football response.
            raise nested_error


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
    robots = verify_robots_policy(BASE_URL, USER_AGENT)
    if robots.get("crawl_delay_seconds"):
        REQUEST_DELAY_SECONDS_LOCAL = max(REQUEST_DELAY_SECONDS, float(robots["crawl_delay_seconds"]))
    else:
        REQUEST_DELAY_SECONDS_LOCAL = REQUEST_DELAY_SECONDS
    captured = now.isoformat(timespec="microseconds").replace("+00:00", "Z")
    summaries: list[dict] = []
    fetch_failures = 0
    CACHE.mkdir(parents=True, exist_ok=True)
    for index, game in enumerate(games):
        if index:
            time.sleep(REQUEST_DELAY_SECONDS_LOCAL)
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
                    fetch_failures += 1
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
                    fetch_failures += 1
                    continue
                body = b"".join(chunks)
                summary = json.loads(body.decode("utf-8"))
                if not isinstance(summary, dict):
                    fetch_failures += 1
                    continue
                (CACHE / f"espn-football-summary-{event_id}.json").write_bytes(body)
                # Keep the actual response clock with each summary. Reusing
                # the run-start clock could let a response fetched after tip
                # qualify as a pregame quote during a long capture.
                item_captured = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
                summaries.append({"event_id": event_id, "summary": summary, "url": url, "captured_at": item_captured})
        except (requests.RequestException, ValueError, json.JSONDecodeError):
            fetch_failures += 1
            continue
    summary_count, pickcenter_count = summary_capture_counts(summaries)
    completed_at = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    receipt = {
        "provider": PROVIDER,
        "sport": SPORT,
        "season": season,
        "captured_at": completed_at,
        "capture_started_at": captured,
        "horizon_days": horizon_days,
        "event_ids": [item["event_id"] for item in summaries],
        "urls": [item["url"] for item in summaries],
        # Retain bounded capture diagnostics so the public market endpoint can
        # distinguish an empty quote response from an unobserved schedule.
        "eligible_games": len(games),
        "summary_fetch_failures": fetch_failures,
        "summary_count": summary_count,
        "summary_with_pickcenter": pickcenter_count,
        "timing_basis": "summary_capture",
        "robots_policy": robots,
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
            item_captured = timestamp(item.get("captured_at") or receipt["captured_at"])
            for bookmaker, market, updated, payload in parse_football_pickcenter(item["summary"], game, item_captured, receipt_id):
                # Football schedules live in the dedicated FOOTBALL_DB. Keep
                # bounded display context in the ledger payload so the public
                # market archive can read these rows without a cross-D1 join.
                payload = {
                    **payload,
                    "season": int(game["season"]),
                    "home_name": str(game.get("home_name") or game["home_id"]),
                    "away_name": str(game.get("away_name") or game["away_id"]),
                }
                key = digest([SPORT, game["id"], PROVIDER, bookmaker, market, item_captured, payload])
                conn.execute(
                    "INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)",
                    (key, SPORT, game["id"], PROVIDER, bookmaker, market, item_captured, updated, encoded(payload)),
                )
                accepted += 1
        except (KeyError, TypeError, ValueError):
            rejected += 1
    # Keep the receipt self-describing. The source response is private, but
    # these bounded counts are safe publication metadata and make a failed or
    # empty football capture auditable without implying that a line existed.
    eligible_games = receipt.get("eligible_games", len(games))
    if not isinstance(eligible_games, int) or eligible_games < 0:
        eligible_games = len(games)
    fetch_failures = receipt.get("summary_fetch_failures", 0)
    if not isinstance(fetch_failures, int) or fetch_failures < 0:
        fetch_failures = 0
    summary_count = receipt.get("summary_count", len(summaries))
    if not isinstance(summary_count, int) or summary_count < 0:
        summary_count = len(summaries)
    summary_with_pickcenter = receipt.get("summary_with_pickcenter")
    if not isinstance(summary_with_pickcenter, int) or summary_with_pickcenter < 0:
        summary_with_pickcenter = sum(
            1
            for item in summaries
            if isinstance(item, dict)
            and isinstance(item.get("summary"), dict)
            and isinstance(item["summary"].get("pickcenter"), list)
            and bool(item["summary"].get("pickcenter"))
        )
    conn.execute(
        "UPDATE audit_receipts SET payload_json=? WHERE id=?",
        (encoded({
            **receipt,
            "eligible_games": eligible_games,
            "summary_fetch_failures": fetch_failures,
            "summary_count": summary_count,
            "summary_with_pickcenter": summary_with_pickcenter,
            "accepted_markets": accepted,
            "rejected_records": rejected,
            "market_status": (
                "capture_incomplete" if fetch_failures > 0 and eligible_games > 0 else
                "validated_quotes" if accepted > 0 else
                "quotes_failed_validation" if rejected > 0 else
                "no_quotes_published" if summary_count > 0 else
                "no_eligible_summaries" if eligible_games == 0 else
                "capture_incomplete"
            ),
        }), receipt_id),
    )
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
