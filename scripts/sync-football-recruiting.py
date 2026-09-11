"""Synchronize the source-attributed football personnel releases into D1.

The regular football publisher includes these datasets in its complete SQL
export. This standalone path is useful when personnel releases are added to an
already-published football warehouse: it writes only the 2025–26 roster,
recruiting, talent and returning-production scopes and imports them in bounded
replayable chunks.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from sql_batches import is_retryable_d1_import_error, split_sql_file

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / ".local/football.sqlite3"
SQL_PATH = ROOT / ".local/football-recruiting.sql"
CHUNK_DIR = ROOT / ".local/football-recruiting-import-chunks"
DATABASE = os.getenv("FOOTBALL_D1_DATABASE", "bball-football-v1")
DATASETS = ("rosters", "recruits", "team_talent", "returning_production")
SEASONS = (2025, 2026)


def sql(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_sql() -> dict[str, int]:
    if not DB_PATH.exists():
        raise SystemExit("Run the football publisher before syncing personnel data")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    counts: dict[str, int] = {}
    with SQL_PATH.open("w") as output:
        # Deletes are first so sql_batches keeps each replay idempotent.
        for dataset in DATASETS:
            for season in SEASONS:
                output.write(f"DELETE FROM football_stats WHERE dataset={sql(dataset)} AND season={season};\n")
        for dataset in DATASETS:
            for season in SEASONS:
                source = conn.execute(
                    "SELECT receipt_json FROM football_sources WHERE dataset=? AND season=?",
                    (dataset, season),
                ).fetchone()
                rows = conn.execute(
                    "SELECT dataset,season,record_key,athlete_id,team_id,game_id,category,stats_json FROM football_stats WHERE dataset=? AND season=? ORDER BY record_key",
                    (dataset, season),
                ).fetchall()
                if not source or not rows:
                    raise SystemExit(f"Missing published football personnel scope: {dataset}/{season}")
                output.write(
                    "INSERT OR REPLACE INTO football_sources VALUES ("
                    + ",".join(sql(value) for value in (dataset, season, source[0]))
                    + ");\n"
                )
                for row in rows:
                    output.write(
                        "INSERT OR REPLACE INTO football_stats VALUES (" + ",".join(sql(value) for value in row) + ");\n"
                    )
                counts[f"{dataset}/{season}"] = len(rows)
    conn.close()
    return counts


def run_remote(path: Path) -> None:
    chunks = split_sql_file(path, CHUNK_DIR)
    for index, chunk in enumerate(chunks, 1):
        command = [
            sys.executable,
            str(ROOT / "scripts/cloudflare.py"),
            "d1",
            "execute",
            DATABASE,
            "--remote",
            "--file",
            os.path.relpath(chunk, ROOT / "worker"),
        ]
        for attempt in range(1, 4):
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            if result.returncode == 0:
                break
            output = (result.stdout or "") + (result.stderr or "")
            if attempt == 3 or not is_retryable_d1_import_error(output):
                print(output, file=sys.stderr, end="")
                raise subprocess.CalledProcessError(result.returncode, command)
        print(f"Imported personnel chunk {index}/{len(chunks)}", flush=True)


if __name__ == "__main__":
    counts = write_sql()
    print(json.dumps({"scopes": counts, "sql": str(SQL_PATH)}))
    if "--sql-only" not in sys.argv[1:]:
        run_remote(SQL_PATH)
