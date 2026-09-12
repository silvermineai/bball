"""Publish the compact NCAA shooting profile refresh without replaying the archive."""

from __future__ import annotations

import argparse
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from sql_batches import split_sql_file

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / ".local/basketball.sqlite3"
EXPORT = ROOT / ".local/ncaa-source-labeled-shots.sql"
CHUNKS = ROOT / ".local/ncaa-source-labeled-shots-sql"
D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def build_export() -> list[Path]:
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        statements: list[str] = []
        seasons = [row[0] for row in conn.execute("SELECT DISTINCT season FROM bb_ncaa_player_shooting ORDER BY season")]
        for season in seasons:
            statements.append(f"DELETE FROM bb_ncaa_player_shooting WHERE season={int(season)};\n")
        for row in conn.execute(
            "SELECT season,player_id,team_id,player_name,team_name,stats_json "
            "FROM bb_ncaa_player_shooting ORDER BY season,player_id,team_id"
        ):
            statements.append(
                "INSERT OR REPLACE INTO bb_ncaa_player_shooting "
                "(season,player_id,team_id,player_name,team_name,stats_json) VALUES ("
                + ",".join(quote(value) for value in row)
                + ");\n"
            )
        statements.append("DELETE FROM bb_unresolved WHERE dataset='ncaa_shots';\n")
        for row in conn.execute(
            "SELECT dataset,season,row_index,reason,source_json FROM bb_unresolved "
            "WHERE dataset='ncaa_shots' ORDER BY season,row_index"
        ):
            statements.append(
                "INSERT OR REPLACE INTO bb_unresolved "
                "(dataset,season,row_index,reason,source_json) VALUES ("
                + ",".join(quote(value) for value in row)
                + ");\n"
            )
    finally:
        conn.close()
    EXPORT.write_text("".join(statements))
    return split_sql_file(EXPORT, CHUNKS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", action="store_true", help="Import generated batches into remote D1")
    args = parser.parse_args()
    batches = build_export()
    print(f"Prepared {len(batches)} NCAA shooting refresh batches")
    if not args.remote:
        return
    for index, path in enumerate(batches, 1):
        command = [
            sys.executable,
            str(ROOT / "scripts/cloudflare.py"),
            "d1",
            "execute",
            D1_DB_NAME,
            "--remote",
            "--yes",
            "--file",
            str(path),
        ]
        subprocess.run(command, cwd=ROOT, check=True)
        print(f"Imported NCAA shooting refresh batch {index}/{len(batches)}", flush=True)


if __name__ == "__main__":
    main()
