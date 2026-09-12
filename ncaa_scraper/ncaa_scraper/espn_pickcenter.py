"""Capture prospective ESPN pickcenter quotes for scheduled basketball games.

The public ESPN summary endpoint is used only for confirmed future games.  A
summary is accepted when its event ID, start instant and ESPN team IDs match
the retained schedule exactly.  ESPN does not publish a quote update clock in
this response, so the bounded capture clock is recorded for both observation
and update time; historical summaries are never replayed into the ledger.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from .football_sources import ROOT, utcnow
from .odds_feed import schedules
from .research_ledger import connect, digest, encoded, finite, timestamp

PROVIDER = "ESPN Summary"
SPORT = "basketball"
BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary"
DOCS_URL = "https://www.espn.com/mens-college-basketball/"
CACHE = ROOT / ".local/odds"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024


def american_to_decimal(value: object) -> float:
    """Convert an American price, rejecting missing or sentinel values."""
    if isinstance(value, bool) or value in (None, ""):
        raise ValueError("Missing American price")
    try:
        number = float(str(value).strip().replace("+", "", 1))
    except (TypeError, ValueError):
        raise ValueError("Invalid American price") from None
    if not finite(number) or number == 0:
        raise ValueError("Invalid American price")
    result = 1 + (number / 100 if number > 0 else 100 / abs(number))
    if not finite(result) or result <= 1:
        raise ValueError("Invalid decimal price")
    return result


def numeric_line(value: object) -> float:
    """Parse ESPN's spread/total strings such as ``+3.5`` or ``o155.5``."""
    if isinstance(value, bool) or value in (None, ""):
        raise ValueError("Missing line")
    match = re.search(r"[-+]?\d+(?:\.\d+)?", str(value).strip())
    if not match:
        raise ValueError("Invalid line")
    line = float(match.group(0))
    if not finite(line):
        raise ValueError("Invalid line")
    return line


def _close(obj: object) -> dict:
    if not isinstance(obj, dict) or not isinstance(obj.get("close"), dict):
        raise ValueError("Provider close quote is missing")
    return obj["close"]


def validate_identity(summary: dict, game: dict) -> tuple[str, str]:
    """Return the canonical start and event ID after strict ESPN identity checks."""
    header = summary.get("header")
    if not isinstance(header, dict):
        raise ValueError("Missing ESPN summary header")
    competitions = header.get("competitions")
    if not isinstance(competitions, list) or len(competitions) != 1:
        raise ValueError("Missing unique ESPN competition")
    competition = competitions[0]
    if not isinstance(competition, dict):
        raise ValueError("Malformed ESPN competition")
    event_id = str(summary.get("header", {}).get("id") or competition.get("id") or "")
    if not event_id or event_id != str(game["id"]):
        raise ValueError("ESPN event ID does not match schedule")
    raw_start = competition.get("date") or competition.get("startDate")
    if not isinstance(raw_start, str):
        raise ValueError("Missing ESPN start time")
    start = timestamp(raw_start)
    if start != timestamp(game["starts_at"]):
        raise ValueError("ESPN start time does not match schedule")
    competitors = competition.get("competitors")
    if not isinstance(competitors, list) or len(competitors) != 2:
        raise ValueError("Missing ESPN competitors")
    side_ids: dict[str, str] = {}
    for competitor in competitors:
        if not isinstance(competitor, dict):
            raise ValueError("Malformed ESPN competitor")
        side = competitor.get("homeAway")
        team_id = str(competitor.get("id") or competitor.get("team", {}).get("id") or "")
        if side not in ("home", "away") or not team_id or side in side_ids:
            raise ValueError("Malformed ESPN competitor identity")
        side_ids[side] = team_id
    if side_ids != {"home": str(game["home_id"]), "away": str(game["away_id"])}:
        raise ValueError("ESPN participants do not match schedule")
    return start, event_id


def parse_pickcenter(summary: dict, game: dict, captured_at: str, receipt_id: str) -> list[tuple[str, str, str, dict]]:
    """Parse one summary into validated ledger market rows."""
    start, event_id = validate_identity(summary, game)
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
        if not bookmaker or len(bookmaker) > 100:
            continue
        base = {
            "home_id": game["home_id"],
            "away_id": game["away_id"],
            "starts_at": start,
            "event_id": event_id,
            "receipt_id": receipt_id,
        }
        try:
            ml = pick["moneyline"]
            home_ml = american_to_decimal(_close(ml["home"])["odds"])
            away_ml = american_to_decimal(_close(ml["away"])["odds"])
            rows.append((bookmaker, "h2h", captured, {**base, "line": None, "home_price": home_ml, "away_price": away_ml}))
            spread = pick["pointSpread"]
            home_spread = numeric_line(_close(spread["home"])["line"])
            away_spread = numeric_line(_close(spread["away"])["line"])
            if abs(home_spread + away_spread) > 1e-9:
                raise ValueError("Spread sides do not sum to zero")
            rows.append((bookmaker, "spreads", captured, {**base, "line": home_spread, "home_price": american_to_decimal(_close(spread["home"])["odds"]), "away_price": american_to_decimal(_close(spread["away"])["odds"])}))
            total = pick["total"]
            over = _close(total["over"])
            under = _close(total["under"])
            total_line = numeric_line(over["line"])
            if total_line < 0 or total_line != numeric_line(under["line"]):
                raise ValueError("Total sides do not agree")
            rows.append((bookmaker, "totals", captured, {**base, "line": total_line, "over_price": american_to_decimal(over["odds"]), "under_price": american_to_decimal(under["odds"])}))
        except (KeyError, TypeError, ValueError):
            # A provider occasionally publishes a partial pickcenter. Keep
            # complete two-sided markets only; do not fabricate a missing side.
            continue
    if not rows:
        raise ValueError("No complete current pickcenter markets")
    return rows


def ingest(conn: sqlite3.Connection, summaries: list[dict], receipt: dict, games: list[dict], now: str) -> dict[str, int]:
    captured = timestamp(receipt["captured_at"])
    receipt_id = digest(receipt)
    conn.execute("INSERT OR IGNORE INTO audit_receipts VALUES (?,?,?,?)", (receipt_id, captured, PROVIDER, encoded(receipt)))
    by_id = {str(game["id"]): game for game in games}
    accepted = rejected = 0
    for item in summaries:
        try:
            event_id = str(item["event_id"])
            game = by_id[event_id]
            for bookmaker, market, updated, payload in parse_pickcenter(item["summary"], game, captured, receipt_id):
                key = digest([SPORT, game["id"], PROVIDER, bookmaker, market, captured, payload])
                conn.execute("INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)", (key, SPORT, game["id"], PROVIDER, bookmaker, market, captured, updated, encoded(payload)))
                accepted += 1
        except (KeyError, TypeError, ValueError):
            rejected += 1
    conn.commit()
    return {"accepted_markets": accepted, "rejected_records": rejected}


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


def fetch_upcoming(season: int = 2027, horizon_days: int = 60, limit: int = 120) -> tuple[list[dict], dict]:
    now = datetime.now(timezone.utc)
    games = _future_games(schedules(SPORT), season, horizon_days, now)[:limit]
    if limit < 1 or limit > 300:
        raise ValueError("limit must be between 1 and 300")
    captured = now.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    summaries: list[dict] = []
    CACHE.mkdir(parents=True, exist_ok=True)
    for game in games:
        event_id = str(game["id"])
        url = f"{BASE_URL}?event={event_id}"
        try:
            with requests.get(url, headers={"Accept": "application/json", "User-Agent": "SilvermineResearch/1.0 (bball.silvermine.dev)"}, timeout=(5, 15), stream=True, allow_redirects=False) as response:
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
                (CACHE / f"espn-summary-{event_id}.json").write_bytes(body)
                summaries.append({"event_id": event_id, "summary": summary, "url": url})
        except (requests.RequestException, ValueError, json.JSONDecodeError):
            continue
    receipt = {"provider": PROVIDER, "sport": SPORT, "season": season, "captured_at": captured, "horizon_days": horizon_days, "event_ids": [item["event_id"] for item in summaries], "urls": [item["url"] for item in summaries], "timing_basis": "summary_capture", "sha256": digest(summaries)}
    return summaries, receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2027)
    parser.add_argument("--horizon-days", type=int, default=21)
    parser.add_argument("--limit", type=int, default=120)
    args = parser.parse_args()
    try:
        summaries, receipt = fetch_upcoming(args.season, args.horizon_days, args.limit)
        conn = connect()
        result = ingest(conn, summaries, receipt, schedules(SPORT), timestamp(utcnow()))
        conn.close()
    except (RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps({**result, "summaries": len(summaries)}, indent=2))


if __name__ == "__main__":
    main()
