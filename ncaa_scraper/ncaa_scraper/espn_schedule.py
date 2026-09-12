"""Capture ESPN's public basketball schedule clock observations.

The retained SportsDataverse schedule remains canonical. This collector only
records a dated, exact-ID observation of ESPN's event start and ``timeValid``
flag. It never rewrites ``bb_games`` or promotes an ESPN date-only placeholder
to a confirmed tip. Raw responses stay in the private local cache; the ledger
stores only bounded identity and receipt fields.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import requests

from .football_sources import ROOT, utcnow
from .odds_feed import schedules
from .research_ledger import connect, digest, encoded, timestamp

PROVIDER = "ESPN Scoreboard"
SPORT = "basketball"
BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
DOCS_URL = "https://www.espn.com/mens-college-basketball/"
CACHE = ROOT / ".local/odds"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
DEFAULT_HORIZON_DAYS = 60
REQUEST_DELAY_SECONDS = 0.2


def _competition(event: dict) -> dict:
    competitions = event.get("competitions")
    if not isinstance(competitions, list) or len(competitions) != 1 or not isinstance(competitions[0], dict):
        raise ValueError("Missing unique ESPN competition")
    return competitions[0]


def _time_valid(event: dict, competition: dict) -> bool:
    return event.get("timeValid") is True or competition.get("timeValid") is True


def validate_event(event: dict, game: dict) -> dict:
    """Validate an event against a canonical game using exact IDs.

    Calendar-day agreement is sufficient when either side is explicitly TBD;
    a fully timed canonical row must retain the exact source instant. This
    records disagreements rather than guessing which publisher is correct.
    """
    event_id = str(event.get("id") or "")
    if not event_id or event_id != str(game["id"]):
        raise ValueError("ESPN event ID does not match schedule")
    season = event.get("season")
    if isinstance(season, dict) and season.get("year") is not None and int(season["year"]) != int(game["season"]):
        raise ValueError("ESPN season does not match schedule")
    competition = _competition(event)
    source_start_raw = competition.get("date") or competition.get("startDate") or event.get("date")
    if not isinstance(source_start_raw, str):
        raise ValueError("Missing ESPN start time")
    source_start = timestamp(source_start_raw)
    local_start = timestamp(game["starts_at"])
    if source_start[:10] != local_start[:10]:
        raise ValueError("ESPN calendar date does not match schedule")
    competitors = competition.get("competitors")
    if not isinstance(competitors, list) or len(competitors) != 2:
        raise ValueError("Missing ESPN competitors")
    side_ids: dict[str, str] = {}
    for competitor in competitors:
        if not isinstance(competitor, dict):
            raise ValueError("Malformed ESPN competitor")
        side = competitor.get("homeAway")
        team = competitor.get("team")
        team_id = str(competitor.get("id") or (team.get("id") if isinstance(team, dict) else "") or "")
        if side not in ("home", "away") or not team_id or side in side_ids:
            raise ValueError("Malformed ESPN competitor identity")
        side_ids[side] = team_id
    if side_ids != {"home": str(game["home_id"]), "away": str(game["away_id"])}:
        raise ValueError("ESPN participants do not match schedule")
    if not bool(game["time_tbd"]) and source_start != local_start:
        raise ValueError("ESPN start time does not match confirmed schedule")
    return {
        "event_id": event_id,
        "game_id": str(game["id"]),
        "season": int(game["season"]),
        "local_start": local_start,
        "source_start": source_start,
        "local_time_tbd": bool(game["time_tbd"]),
        "source_time_valid": _time_valid(event, competition),
        "home_id": str(game["home_id"]),
        "away_id": str(game["away_id"]),
    }


def ingest(
    conn: sqlite3.Connection,
    observations: list[dict],
    receipt: dict,
    games: list[dict],
) -> dict[str, int]:
    captured = timestamp(receipt["captured_at"])
    receipt_id = digest(receipt)
    conn.execute(
        "INSERT OR IGNORE INTO audit_receipts VALUES (?,?,?,?)",
        (receipt_id, captured, PROVIDER, encoded(receipt)),
    )
    by_id = {str(game["id"]): game for game in games}
    accepted = rejected = 0
    for item in observations:
        try:
            event = item["event"]
            game = by_id[str(event["id"])]
            row = validate_event(event, game)
            payload = {
                **row,
                "receipt_id": receipt_id,
                "source_url": str(item.get("url") or DOCS_URL)[:300],
            }
            key = digest([SPORT, row["game_id"], PROVIDER, captured, payload])
            conn.execute(
                "INSERT OR IGNORE INTO audit_schedule_times VALUES (?,?,?,?,?,?,?,?)",
                (
                    key,
                    SPORT,
                    row["game_id"],
                    PROVIDER,
                    captured,
                    row["source_start"],
                    int(row["source_time_valid"]),
                    encoded(payload),
                ),
            )
            accepted += 1
        except (KeyError, TypeError, ValueError, sqlite3.Error) as error:
            rejected += 1
            # Keep an explicit bounded review record; never persist the raw
            # provider event, which can contain large links and ticket data.
            event = item.get("event") if isinstance(item, dict) else {}
            event = event if isinstance(event, dict) else {}
            compact = {k: str(event.get(k, ""))[:240] for k in ("id", "date", "name")}
            conn.execute(
                "INSERT OR IGNORE INTO audit_unmatched VALUES (?,?,?,?,?,?)",
                (
                    digest([SPORT, PROVIDER, captured, compact, type(error).__name__]),
                    SPORT,
                    compact["id"] or "unknown",
                    captured,
                    str(error)[:240],
                    encoded({"event": compact, "event_sha256": digest(event)}),
                ),
            )
    conn.commit()
    return {"accepted_observations": accepted, "rejected_records": rejected}


def _read_json(response: requests.Response) -> dict:
    chunks: list[bytes] = []
    size = 0
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        size += len(chunk)
        if size > MAX_RESPONSE_BYTES:
            raise ValueError("ESPN scoreboard response exceeded the size limit")
        chunks.append(chunk)
    if not chunks:
        raise ValueError("Empty ESPN scoreboard response")
    value = json.loads(b"".join(chunks).decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Malformed ESPN scoreboard response")
    return value


def fetch_upcoming(
    season: int = 2027,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    limit_dates: int = 90,
) -> tuple[list[dict], dict]:
    if not 1 <= horizon_days <= 90:
        raise ValueError("horizon_days must be between 1 and 90")
    if not 1 <= limit_dates <= 90:
        raise ValueError("limit_dates must be between 1 and 90")
    now = datetime.now(timezone.utc)
    until = now + timedelta(days=horizon_days)
    games = [
        game
        for game in schedules(SPORT)
        if game["season"] == season
        and not game["completed"]
        and now < datetime.fromisoformat(game["starts_at"].replace("Z", "+00:00")) <= until
    ]
    dates = sorted({game["starts_at"][:10].replace("-", "") for game in games})[:limit_dates]
    captured = now.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    observations: list[dict] = []
    urls: list[str] = []
    CACHE.mkdir(parents=True, exist_ok=True)
    for index, date in enumerate(dates):
        if index:
            # Keep the bounded public capture polite to ESPN's endpoint.
            time.sleep(REQUEST_DELAY_SECONDS)
        params = {"dates": date, "limit": 500}
        url = f"{BASE_URL}?dates={date}&limit=500"
        try:
            with requests.get(
                BASE_URL,
                params=params,
                headers={"Accept": "application/json", "User-Agent": "SilvermineResearch/1.0 (bball.silvermine.dev)"},
                timeout=(5, 20),
                stream=True,
                allow_redirects=False,
            ) as response:
                if response.status_code != 200:
                    continue
                body = _read_json(response)
                events = body.get("events")
                if not isinstance(events, list):
                    continue
                urls.append(url)
                # Cache a bounded, source-native response privately for replay
                # and receipt verification; it is never sent through the API.
                (CACHE / f"espn-scoreboard-{date}.json").write_text(encoded(body))
                observations.extend(
                    {"event": event, "url": url}
                    for event in events
                    if isinstance(event, dict)
                )
        except (requests.RequestException, ValueError, json.JSONDecodeError):
            continue
    receipt = {
        "provider": PROVIDER,
        "sport": SPORT,
        "season": season,
        "captured_at": captured,
        "horizon_days": horizon_days,
        "dates": dates,
        "urls": urls,
        "timing_basis": "scoreboard_capture",
        "sha256": digest(observations),
    }
    return observations, receipt


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2027)
    parser.add_argument("--horizon-days", type=int, default=DEFAULT_HORIZON_DAYS)
    parser.add_argument("--limit-dates", type=int, default=90)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        observations, receipt = fetch_upcoming(args.season, args.horizon_days, args.limit_dates)
        conn = connect()
        result = ingest(conn, observations, receipt, schedules(SPORT))
        conn.close()
    except (RuntimeError, ValueError) as error:
        build_parser().error(str(error))
    print(json.dumps({**result, "events": len(observations)}, indent=2))


if __name__ == "__main__":
    main()
