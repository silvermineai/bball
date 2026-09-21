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
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from .football_sources import ROOT, utcnow
from .odds_feed import schedules
from .research_ledger import connect, digest, encoded, finite, timestamp

PROVIDER = "ESPN Summary"
SPORT = "basketball"
# ESPN's public web API host serves the same summary/pickcenter schema while
# the site.api host intermittently rejects server-side research requests.
BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary"
DOCS_URL = "https://www.espn.com/mens-college-basketball/"
CACHE = ROOT / ".local/odds"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
# Basketball lines can be published well before tip. Use the existing request
# cap so scheduled captures inspect more of the upcoming slate while remaining
# bounded and prospective; identity and clock checks still gate every quote.
DEFAULT_HORIZON_DAYS = 90
REQUEST_DELAY_SECONDS = 0.2


def american_to_decimal(value: object) -> float:
    """Convert an American price, rejecting missing or sentinel values."""
    if isinstance(value, bool) or value in (None, ""):
        raise ValueError("Missing American price")
    try:
        number = float(str(value).strip().replace("+", "", 1))
    except (TypeError, ValueError):
        raise ValueError("Invalid American price") from None
    # American odds are quoted at +/-100 or farther from zero. Values such as
    # -1 or +25 are malformed source values, not valid prices that should be
    # converted into decimal odds and admitted to the research ledger.
    if not finite(number) or number == 0 or abs(number) < 100:
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


def validate_identity(summary: dict, game: dict) -> tuple[str, str, bool]:
    """Return the source start, event ID and timing flag after strict checks.

    The canonical basketball schedule often carries a date-only placeholder
    while ESPN has already assigned an exact tip.  In that case the summary's
    own ``timeValid`` flag is the required timing evidence: we retain the
    exact ESPN instant only when the event ID, participants and calendar date
    still match the canonical row.  A date-only ESPN event can never qualify
    a market quote.
    """
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
    canonical_start = timestamp(game["starts_at"])
    source_time_valid = header.get("timeValid") is True or competition.get("timeValid") is True
    if bool(game.get("time_tbd")):
        if not source_time_valid:
            raise ValueError("ESPN start time is not confirmed")
        if start[:10] != canonical_start[:10]:
            raise ValueError("ESPN calendar date does not match schedule")
    elif start != canonical_start:
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
    return start, event_id, source_time_valid


def parse_pickcenter(summary: dict, game: dict, captured_at: str, receipt_id: str) -> list[tuple[str, str, str, dict]]:
    """Parse one summary into validated ledger market rows."""
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
        if not bookmaker or len(bookmaker) > 100:
            continue
        base = {
            "home_id": game["home_id"],
            "away_id": game["away_id"],
            "starts_at": start,
            "event_id": event_id,
            "receipt_id": receipt_id,
            # Preserve how an exact start was established. This is useful for
            # audits when the canonical schedule still labels a game TBD.
            "canonical_time_tbd": bool(game.get("time_tbd")),
            "source_time_valid": source_time_valid,
        }
        # ESPN can mark one market (usually moneyline) as ``OFF`` while still
        # publishing complete spread and total quotes. Validate each market
        # independently so an unavailable market never discards usable lines.
        try:
            ml = pick["moneyline"]
            home_ml = american_to_decimal(_close(ml["home"])["odds"])
            away_ml = american_to_decimal(_close(ml["away"])["odds"])
            rows.append((bookmaker, "h2h", captured, {**base, "line": None, "home_price": home_ml, "away_price": away_ml}))
        except (KeyError, TypeError, ValueError):
            pass
        try:
            spread = pick["pointSpread"]
            home_spread = numeric_line(_close(spread["home"])["line"])
            away_spread = numeric_line(_close(spread["away"])["line"])
            if abs(home_spread + away_spread) > 1e-9:
                raise ValueError("Spread sides do not sum to zero")
            rows.append((bookmaker, "spreads", captured, {**base, "line": home_spread, "home_price": american_to_decimal(_close(spread["home"])["odds"]), "away_price": american_to_decimal(_close(spread["away"])["odds"])}))
        except (KeyError, TypeError, ValueError):
            pass
        try:
            total = pick["total"]
            over = _close(total["over"])
            under = _close(total["under"])
            total_line = numeric_line(over["line"])
            if total_line < 0 or total_line != numeric_line(under["line"]):
                raise ValueError("Total sides do not agree")
            rows.append((bookmaker, "totals", captured, {**base, "line": total_line, "over_price": american_to_decimal(over["odds"]), "under_price": american_to_decimal(under["odds"])}))
        except (KeyError, TypeError, ValueError):
            pass
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
            # A future ESPN summary can be valid while publishing no markets
            # yet. Keep that normal availability state separate from a
            # malformed or identity-mismatched quote so the public receipt can
            # explain the capture without calling an unpriced game rejected.
            pickcenter = item.get("summary", {}).get("pickcenter")
            if not isinstance(pickcenter, list) or not pickcenter:
                continue
            for bookmaker, market, updated, payload in parse_pickcenter(item["summary"], game, captured, receipt_id):
                key = digest([SPORT, game["id"], PROVIDER, bookmaker, market, captured, payload])
                conn.execute("INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)", (key, SPORT, game["id"], PROVIDER, bookmaker, market, captured, updated, encoded(payload)))
                accepted += 1
        except (KeyError, TypeError, ValueError):
            rejected += 1
    # Keep the bounded capture diagnostics with the receipt. This lets the
    # public market status explain an empty capture without exposing raw
    # summaries or treating rejected rows as missing data. In particular, a
    # failed request for every eligible game is different from a successful
    # response that contained no published quote.
    eligible_games = receipt.get("eligible_games")
    fetch_failures = receipt.get("summary_fetch_failures", 0)
    if not isinstance(eligible_games, int) or eligible_games < 0:
        eligible_games = len(summaries)
    if not isinstance(fetch_failures, int) or fetch_failures < 0:
        fetch_failures = 0
    conn.execute(
        "UPDATE audit_receipts SET payload_json=? WHERE id=?",
        (encoded({
            **receipt,
            "eligible_games": eligible_games,
            "summary_fetch_failures": fetch_failures,
            "accepted_markets": accepted,
            "rejected_records": rejected,
            "market_status": (
                "validated_quotes" if accepted > 0 else
                "quotes_failed_validation" if rejected > 0 else
                "capture_incomplete" if fetch_failures > 0 and eligible_games > 0 else
                "no_quotes_published" if summaries else
                "no_eligible_summaries"
            ),
        }), receipt_id),
    )
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
        # Include date-only rows so the public ESPN summary can promote them
        # only when its own event payload confirms an exact start. The parser
        # rejects summaries that remain time TBD, so this never invents a tip.
        and now < datetime.fromisoformat(game["starts_at"].replace("Z", "+00:00")) <= until
    ]


def summary_capture_counts(summaries: list[dict]) -> tuple[int, int]:
    """Return fetched summary and non-empty pickcenter counts for a receipt."""
    diagnostics = summary_capture_diagnostics(summaries)
    return diagnostics["summary_count"], diagnostics["summary_with_pickcenter"]


def summary_capture_diagnostics(summaries: list[dict]) -> dict[str, int]:
    """Count fetched summaries and the two provider quote containers separately.

    ESPN can expose a summary while leaving both ``pickcenter`` and ``odds``
    empty, especially before a market is published. Keep this diagnostic
    separate from accepted ledger rows so an empty provider payload is not
    confused with a validation failure.
    """
    with_pickcenter = sum(
        1
        for item in summaries
        if isinstance(item, dict)
        and isinstance(item.get("summary"), dict)
        and isinstance(item["summary"].get("pickcenter"), list)
        and bool(item["summary"].get("pickcenter"))
    )
    with_odds = sum(
        1
        for item in summaries
        if isinstance(item, dict)
        and isinstance(item.get("summary"), dict)
        and isinstance(item["summary"].get("odds"), list)
        and bool(item["summary"].get("odds"))
    )
    return {
        "summary_count": len(summaries),
        "summary_with_pickcenter": with_pickcenter,
        "summary_with_odds": with_odds,
    }


def fetch_upcoming(season: int = 2027, horizon_days: int = DEFAULT_HORIZON_DAYS, limit: int = 120) -> tuple[list[dict], dict]:
    now = datetime.now(timezone.utc)
    games = _future_games(schedules(SPORT), season, horizon_days, now)[:limit]
    if limit < 1 or limit > 300:
        raise ValueError("limit must be between 1 and 300")
    captured = now.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    summaries: list[dict] = []
    fetch_failures = 0
    CACHE.mkdir(parents=True, exist_ok=True)
    for index, game in enumerate(games):
        if index:
            # Keep the bounded public capture polite to ESPN's endpoint.
            time.sleep(REQUEST_DELAY_SECONDS)
        event_id = str(game["id"])
        url = f"{BASE_URL}?event={event_id}"
        try:
            with requests.get(url, headers={"Accept": "application/json", "User-Agent": "SilvermineResearch/1.0 (bball.silvermine.dev)"}, timeout=(5, 15), stream=True, allow_redirects=False) as response:
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
                (CACHE / f"espn-summary-{event_id}.json").write_bytes(body)
                summaries.append({"event_id": event_id, "summary": summary, "url": url})
        except (requests.RequestException, ValueError, json.JSONDecodeError):
            fetch_failures += 1
            continue
    diagnostics = summary_capture_diagnostics(summaries)
    receipt = {
        "provider": PROVIDER,
        "sport": SPORT,
        "season": season,
        "captured_at": captured,
        "horizon_days": horizon_days,
        "event_ids": [item["event_id"] for item in summaries],
        "urls": [item["url"] for item in summaries],
        "eligible_games": len(games),
        "summary_fetch_failures": fetch_failures,
        **diagnostics,
        "timing_basis": "summary_capture",
        "sha256": digest(summaries),
    }
    return summaries, receipt


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2027)
    parser.add_argument("--horizon-days", type=int, default=DEFAULT_HORIZON_DAYS)
    parser.add_argument("--limit", type=int, default=120)
    return parser


def main() -> None:
    parser = build_parser()
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
