"""Import a licensed, provider-exported market CSV into the research ledger.

The importer is deliberately narrower than a sportsbook scraper.  It accepts
rows from a source the operator is allowed to use, requires a license URL and
provider identity, and joins only by the exact source game ID and UTC start.
Invalid or ambiguous rows stop the import before any market record is written.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
from pathlib import Path

from .football_sources import ROOT, utcnow
from .odds_feed import normalize_market, schedules
from .research_ledger import build_report, connect, digest, encoded, export_sql, ingest_published, timestamp

MARKETS = {"spreads", "totals", "h2h"}
REQUIRED = {"game_id", "market", "captured_at", "updated_at", "home_name", "away_name", "starts_at"}


def decimal_price(row: dict[str, str], side: str) -> float | None:
    """Read a decimal price, or convert an optional American price."""
    raw = (row.get(f"{side}_price") or "").strip()
    if raw:
        value = float(raw)
        if value <= 1:
            raise ValueError(f"{side}_price must be greater than 1")
        return value
    american = (row.get(f"{side}_american") or "").strip()
    if not american:
        return None
    value = float(american)
    if value == 0:
        raise ValueError(f"{side}_american cannot be zero")
    return 1 + (value / 100 if value > 0 else 100 / abs(value))


def numeric(row: dict[str, str], *keys: str) -> float | None:
    for key in keys:
        raw = (row.get(key) or "").strip()
        if raw:
            return float(raw)
    return None


def event_and_market(row: dict[str, str], game: dict, row_number: int):
    market = (row.get("market") or "").strip().lower()
    if market not in MARKETS:
        raise ValueError(f"row {row_number}: market must be spreads, totals or h2h")
    if (row.get("home_name") or "").strip() != game["home_name"]:
        raise ValueError(f"row {row_number}: home_name does not match the exact schedule row")
    if (row.get("away_name") or "").strip() != game["away_name"]:
        raise ValueError(f"row {row_number}: away_name does not match the exact schedule row")
    if timestamp(row["starts_at"]) != game["starts_at"]:
        raise ValueError(f"row {row_number}: starts_at does not match the exact schedule row")
    captured = timestamp(row["captured_at"])
    updated = timestamp(row["updated_at"])
    if captured >= game["starts_at"]:
        raise ValueError(f"row {row_number}: captured_at must be before scheduled start")
    if updated > captured:
        raise ValueError(f"row {row_number}: updated_at is after captured_at")
    if not row.get("bookmaker", "").strip():
        raise ValueError(f"row {row_number}: bookmaker is required")
    event_id = (row.get("event_id") or "").strip() or digest([game["id"], row_number, row])
    event = {
        "id": event_id,
        "sport_key": "americanfootball_ncaaf" if game.get("sport") == "football" else "basketball_ncaab",
        "commence_time": game["starts_at"],
        "home_team": game["home_name"],
        "away_team": game["away_name"],
    }
    if market == "totals":
        line = numeric(row, "line", "total_line")
        if line is None:
            raise ValueError(f"row {row_number}: a line is required for totals")
        first, second = decimal_price(row, "over"), decimal_price(row, "under")
        outcomes = [
            {"name": "Over", "point": line, "price": first},
            {"name": "Under", "point": line, "price": second},
        ]
    elif market == "spreads":
        line = numeric(row, "line", "home_spread")
        if line is None:
            raise ValueError(f"row {row_number}: a line is required for spreads")
        first, second = decimal_price(row, "home"), decimal_price(row, "away")
        outcomes = [
            {"name": game["home_name"], "point": line, "price": first},
            {"name": game["away_name"], "point": -line if line is not None else None, "price": second},
        ]
    else:
        line = None
        first, second = decimal_price(row, "home"), decimal_price(row, "away")
        outcomes = [
            {"name": game["home_name"], "price": first},
            {"name": game["away_name"], "price": second},
        ]
    if any(outcome.get("price") is None for outcome in outcomes):
        raise ValueError(f"row {row_number}: both market prices are required")
    bookmaker = (row.get("bookmaker") or "").strip()
    return event, {"key": market, "outcomes": outcomes, "last_update": updated}, bookmaker, captured


def import_rows(conn: sqlite3.Connection, sport: str, rows: list[dict[str, str]], source_sha256: str, source_name: str, provider: str, license_url: str, imported_at: str):
    if sport not in ("football", "basketball"):
        raise ValueError("sport must be football or basketball")
    if not provider.strip() or not license_url.strip():
        raise ValueError("provider and license_url are required")
    games = {str(game["id"]): game for game in schedules(sport)}
    receipt = {
        "provider": provider,
        "sport": sport,
        "imported_at": imported_at,
        "source_file": source_name,
        "file_sha256": source_sha256,
        "license_url": license_url,
        "rows": len(rows),
    }
    receipt_id = digest(receipt)
    conn.execute(
        "INSERT OR IGNORE INTO audit_receipts VALUES (?,?,?,?)",
        (receipt_id, imported_at, provider, encoded(receipt)),
    )
    accepted = 0
    errors = []
    for row_number, row in enumerate(rows, start=2):
        try:
            game_id = (row.get("game_id") or "").strip()
            if not game_id or game_id not in games:
                raise ValueError("game_id is not an exact source schedule ID")
            game = {**games[game_id], "sport": sport}
            event, market, bookmaker, captured = event_and_market(row, game, row_number)
            updated, payload = normalize_market(
                event,
                {"key": bookmaker, "last_update": market["last_update"]},
                market,
                game,
                captured,
                receipt_id,
            )
            key = digest([sport, game_id, "CSV:" + provider, bookmaker, market["key"], captured, payload])
            conn.execute(
                "INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)",
                (key, sport, game_id, "CSV:" + provider, bookmaker, market["key"], captured, updated, encoded(payload)),
            )
            accepted += 1
        except (KeyError, TypeError, ValueError, OverflowError) as error:
            errors.append(str(error))
    if errors:
        conn.rollback()
        raise ValueError("CSV import rejected: " + "; ".join(errors[:8]) + ("; …" if len(errors) > 8 else ""))
    conn.commit()
    return {"accepted_markets": accepted, "receipt_id": receipt_id, "rows": len(rows)}


def read_csv(path: Path):
    raw = path.read_bytes()
    digest_hex = hashlib.sha256(raw).hexdigest()
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or [])
        missing = REQUIRED - fields
        if missing:
            raise ValueError("CSV is missing required columns: " + ", ".join(sorted(missing)))
        rows = list(reader)
    if not rows:
        raise ValueError("CSV contains no rows")
    return rows, digest_hex


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="CSV export from the licensed market provider")
    parser.add_argument("--sport", choices=("football", "basketball"), required=True)
    parser.add_argument("--provider", required=True, help="Provider identity, for example a licensed bookmaker feed")
    parser.add_argument("--license-url", required=True, help="URL for the provider terms/license governing this export")
    parser.add_argument("--sql", type=Path, default=ROOT / ".local/research-ledger.sql")
    args = parser.parse_args()
    rows, source_sha256 = read_csv(args.file)
    now = timestamp(utcnow())
    conn = connect()
    try:
        ingest_published(conn, now)
        result = import_rows(conn, args.sport, rows, source_sha256, args.file.name, args.provider.strip(), args.license_url.strip(), now)
        report = build_report(conn, now)
        (ROOT / "frontend/public/data/research").mkdir(parents=True, exist_ok=True)
        (ROOT / "frontend/public/data/research/ledger.json").write_text(encoded(report))
        export_sql(conn, args.sql)
        print(json.dumps({**result, "market_observations": report["market_observations"]}, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
