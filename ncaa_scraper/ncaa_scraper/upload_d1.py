"""Upload the local SQLite scrape database to the remote D1 Worker ingest API."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DEFAULT_API_BASE = "https://bball.silvermine.dev"
DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "ncaa_mbb.sqlite3"
TABLES: dict[str, list[str]] = {
    "seasons": ["id", "internal_id", "label", "sport_code", "division", "created_at"],
    "teams": ["ncaa_team_id", "internal_id", "org_id", "name", "season_label", "sport_code", "division", "record", "updated_at"],
    "games": [
        "contest_id",
        "internal_id",
        "season_label",
        "game_date",
        "venue",
        "attendance",
        "away_team_id",
        "home_team_id",
        "away_org_id",
        "home_org_id",
        "away_score",
        "home_score",
        "scrape_status",
        "last_scraped_at",
        "created_at",
        "updated_at",
    ],
    "team_games": [
        "id",
        "contest_id",
        "ncaa_team_id",
        "opponent_team_id",
        "game_date",
        "result",
        "attendance",
        "is_away",
        "neutral_site",
    ],
    "players": ["player_internal_id", "internal_id", "ncaa_player_id", "name"],
    "player_game_stats": [
        "id",
        "contest_id",
        "team_org_id",
        "team_name",
        "player_internal_id",
        "ncaa_player_id",
        "player_name",
        "sport_code",
        "stat_group",
        "table_index",
        "row_index",
        "stats_json",
        "jersey_number",
        "position",
        "minutes",
        "fgm",
        "fga",
        "fg_pct",
        "three_fgm",
        "three_fga",
        "ftm",
        "fta",
        "points",
        "offensive_rebounds",
        "defensive_rebounds",
        "total_rebounds",
        "assists",
        "turnovers",
        "steals",
        "blocks",
        "fouls",
        "disqualifications",
        "technical_fouls",
        "bench_points",
    ],
    "play_by_play_actions": [
        "id",
        "contest_id",
        "sequence",
        "period",
        "clock",
        "team_org_id",
        "team_name",
        "player_internal_id",
        "ncaa_player_id",
        "player_name",
        "event_type",
        "description",
        "home_score",
        "away_score",
    ],
    "shots": [
        "play_id",
        "contest_id",
        "sequence",
        "period",
        "clock",
        "team_org_id",
        "player_internal_id",
        "ncaa_player_id",
        "player_name",
        "x",
        "y",
        "made",
        "is_three",
        "shot_value",
        "description",
        "classes",
    ],
    "scrape_logs": ["id", "url", "cache_key", "status_code", "fetched_at", "error"],
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload local NCAA SQLite scrape data to remote D1")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to local SQLite database")
    parser.add_argument("--api-base", default=os.environ.get("BBALL_REMOTE_API_BASE", DEFAULT_API_BASE))
    parser.add_argument("--api-key", default=os.environ.get("BBALL_INGEST_API_KEY"))
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--table", choices=list(TABLES), action="append")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.api_key and not args.dry_run:
        raise SystemExit("Set BBALL_INGEST_API_KEY or pass --api-key.")

    db_path = Path(args.db)
    tables = args.table or list(TABLES)
    total_rows = 0
    with sqlite3.connect(db_path) as conn:
      conn.row_factory = sqlite3.Row
      for table in tables:
          count = upload_table(conn, table, args.api_base.rstrip("/"), args.api_key, args.batch_size, args.dry_run)
          total_rows += count
    print(json.dumps({"ok": True, "tables": tables, "rows": total_rows}, indent=2))


def upload_table(
    conn: sqlite3.Connection,
    table: str,
    api_base: str,
    api_key: str | None,
    batch_size: int,
    dry_run: bool,
) -> int:
    columns = TABLES[table]
    rows = conn.execute(f"SELECT {', '.join(columns)} FROM {table} ORDER BY 1").fetchall()
    payload_rows: list[dict[str, Any]] = [dict(row) for row in rows]
    if dry_run:
        print(f"[dry-run] {table}: {len(payload_rows)} rows")
        return len(payload_rows)

    sent = 0
    for idx in range(0, len(payload_rows), batch_size):
        batch = payload_rows[idx : idx + batch_size]
        post_json(
            f"{api_base}/api/ingest/batch",
            {"table": table, "rows": batch},
            api_key or "",
        )
        sent += len(batch)
        print(f"[upload] {table}: {sent}/{len(payload_rows)}", flush=True)
    return sent


def post_json(url: str, payload: dict[str, Any], api_key: str) -> Any:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "silvermine-bball-local-uploader/0.1",
        },
    )
    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(detail, file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
