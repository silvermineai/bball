"""Import authorized CBBD pregame moneylines into the research ledger.

CBBD's historical lines response has a game start clock and provider name but
no quote capture/update clock. The importer therefore captures the response at
ingest time and accepts only games that have not started yet. It imports only
moneylines with valid prices; spread/total values without paired prices remain
source evidence rather than fabricated market quotes.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from .cbbd_recruiting import LICENSE_URL, PROVIDER, api_key, capture_clock, compact, digest, fetch_json
from .football_sources import ROOT, utcnow
from .odds_feed import normalize_name, schedules
from .research_ledger import connect, timestamp

LINES_PATH = "/lines"


def decimal_moneyline(value: object) -> float:
    """Convert an American moneyline to decimal odds, rejecting sentinels."""
    if isinstance(value, bool) or value in (None, ""):
        raise ValueError("Missing moneyline")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid moneyline") from None
    if number == 0 or number != number or abs(number) == float("inf"):
        raise ValueError("Invalid moneyline")
    return 1 + (number / 100 if number > 0 else 100 / abs(number))


def match_game(row: dict, games: list[dict]) -> dict:
    start = timestamp(row["startDate"])
    home = normalize_name(row["homeTeam"])
    away = normalize_name(row["awayTeam"])
    candidates = [
        game for game in games
        if not game["completed"]
        and not game["time_tbd"]
        and game["starts_at"] == start
        and home in game["home_aliases"]
        and away in game["away_aliases"]
    ]
    if len(candidates) != 1:
        raise ValueError("No unique exact participant/start-time match")
    return candidates[0]


def ingest(conn: sqlite3.Connection, rows: list[dict], receipt: dict, games: list[dict], now: str) -> dict[str, int]:
    captured = timestamp(receipt["captured_at"])
    receipt_id = digest(receipt)
    conn.execute(
        "INSERT OR IGNORE INTO audit_receipts VALUES (?,?,?,?)",
        (receipt_id, captured, PROVIDER, compact(receipt)),
    )
    accepted = rejected = 0
    for row in rows:
        try:
            game = match_game(row, games)
            start = timestamp(row["startDate"])
            if start <= captured:
                raise ValueError("Game already started at capture")
            lines = row.get("lines")
            if not isinstance(lines, list):
                raise ValueError("Missing lines array")
            for line in lines:
                provider = str(line.get("provider", "")).strip()
                if not provider or len(provider) > 100:
                    raise ValueError("Missing line provider")
                home_price = decimal_moneyline(line.get("homeMoneyline"))
                away_price = decimal_moneyline(line.get("awayMoneyline"))
                payload = {
                    "home_id": game["home_id"],
                    "away_id": game["away_id"],
                    "starts_at": start,
                    "event_id": str(row["gameId"]),
                    "line": None,
                    "home_price": home_price,
                    "away_price": away_price,
                    "receipt_id": receipt_id,
                }
                key = digest(["basketball", game["id"], PROVIDER, provider, "h2h", captured, payload])
                conn.execute(
                    "INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)",
                    (key, "basketball", game["id"], PROVIDER, provider, "h2h", captured, captured, compact(payload)),
                )
                accepted += 1
        except (KeyError, TypeError, ValueError):
            rejected += 1
    conn.commit()
    return {"accepted_markets": accepted, "rejected_records": rejected}


def fetch_lines(season: int, token: str | None = None) -> tuple[list[dict], dict]:
    if not 2000 <= season <= 2035:
        raise ValueError("CBBD lines season must be between 2000 and 2035")
    token = token or api_key()
    if not token:
        raise RuntimeError("No CBBD_API_KEY configured. Add it to ~/.env; no provider call was made.")
    rows, url = fetch_json(LINES_PATH, {"season": season}, token)
    captured = capture_clock()
    receipt = {
        "provider": PROVIDER,
        "sport": "basketball",
        "season": season,
        "captured_at": captured,
        "url": url,
        "license_url": LICENSE_URL,
        "sha256": digest(rows),
    }
    return rows, receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2027)
    args = parser.parse_args()
    try:
        rows, receipt = fetch_lines(args.season)
        conn = connect()
        result = ingest(conn, rows, receipt, schedules("basketball"), timestamp(utcnow()))
        conn.close()
    except (RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
