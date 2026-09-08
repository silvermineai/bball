"""Sync the current basketball model and a newly added season into D1.

The main basketball SQL export intentionally omits the large model table. This
small, idempotent release keeps the latest model and forecast rows in D1 and
also supports adding a cached historical season without replaying every other
research table. SQL is split below D1's request and statement limits.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / ".local/basketball.sqlite3"
OUT = ROOT / ".local/basketball-core.sql"
PY = sys.executable


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def row_statements(conn, table, season):
    columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
    if not columns:
        raise ValueError(f"Unknown table: {table}")
    rows = conn.execute(
        f"SELECT {','.join(columns)} FROM {table} WHERE season=?", (season,)
    )
    prefix = f"INSERT OR REPLACE INTO {table} ({','.join(columns)}) VALUES ("
    for row in rows:
        yield prefix + ",".join(quote(value) for value in row) + ");\n"


def split_sql(statements, path, max_bytes=7_500_000):
    batches = []
    current = []
    size = 0

    def flush():
        nonlocal current, size
        if not current:
            return
        target = path if not batches else path.with_name(
            f"{path.stem}-{len(batches):04d}{path.suffix}"
        )
        target.write_text("".join(current))
        batches.append(target)
        current, size = [], 0

    for statement in statements:
        encoded = len(statement.encode())
        if encoded >= 100_000:
            raise ValueError("A D1 statement exceeds the 100 KB limit")
        if current and size + encoded > max_bytes:
            flush()
        current.append(statement)
        size += encoded
    flush()
    return batches


def build(season=2023):
    overview = json.loads(
        (ROOT / "frontend/public/data/basketball/overview.json").read_text()
    )
    model = overview["model"]
    if model.get("id", "").startswith("basketball-efficiency-v1-") is False:
        raise ValueError("Unexpected basketball model ID")
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    statements = []
    # Models are queried only for identity and creation time by the public API.
    # Keep a compact, useful metadata record in D1 while the complete fitted
    # artifact remains in the static, hash-checked edition.
    model_metadata = {
        key: model[key]
        for key in (
        "version",
        "target_season",
        "cutoff",
        "training_games",
            "training_seasons",
            "calibration",
            "evaluation",
        )
        if key in model
    }
    statements.append(
        "INSERT OR REPLACE INTO bb_models (id,created_at,artifact_json) VALUES ("
        + ",".join(
            quote(v)
            for v in (
                model["id"],
                overview["generated_at"],
                json.dumps(model_metadata, separators=(",", ":")),
            )
        )
        + ");\n"
    )
    for game in overview["upcoming"]:
        prediction = game.get("prediction")
        if prediction is None:
            continue
        statements.append(
            "INSERT OR REPLACE INTO bb_forecasts (game_id,model_id,created_at,prediction_json) VALUES ("
            + ",".join(
                quote(v)
                for v in (
                    game["id"],
                    model["id"],
                    overview["generated_at"],
                    json.dumps(prediction, separators=(",", ":")),
                )
            )
            + ");\n"
        )

    # Add the 2022–23 ESPN-derived season and its compact identity context.
    # Full publishers may replay these rows; INSERT OR REPLACE keeps either
    # path safe and preserves all existing editions.
    for table in (
        "bb_sources",
        "bb_games",
        "bb_team_box",
        "bb_player_box",
        "bb_participation",
        "bb_team_season",
        "bb_publisher_ratings",
        "bb_player_value",
        "bb_player_core",
    ):
        try:
            statements.extend(row_statements(conn, table, season))
        except sqlite3.OperationalError:
            # Optional tables are absent in small development fixtures.
            continue
    # Player identities are global, so include the current compact dictionary
    # needed by player-box lookups after adding a historical season.
    columns = [row[1] for row in conn.execute("PRAGMA table_info(bb_players)")]
    for row in conn.execute(f"SELECT {','.join(columns)} FROM bb_players"):
        statements.append(
            f"INSERT OR REPLACE INTO bb_players ({','.join(columns)}) VALUES ("
            + ",".join(quote(value) for value in row)
            + ");\n"
        )
    conn.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    for old in OUT.parent.glob(f"{OUT.stem}*{OUT.suffix}"):
        old.unlink()
    batches = split_sql(statements, OUT)
    manifest = {
        "model_id": model["id"],
        "season": season,
        "batches": [path.name for path in batches],
        "forecast_rows": sum(
            1 for game in overview["upcoming"] if game.get("prediction") is not None
        ),
    }
    OUT.with_name("basketball-core-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    return batches, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2023)
    parser.add_argument("--remote", action="store_true")
    args = parser.parse_args()
    batches, manifest = build(args.season)
    if args.remote:
        for index, batch in enumerate(batches, 1):
            subprocess.run(
                [
                    PY,
                    str(ROOT / "scripts/cloudflare.py"),
                    "d1",
                    "execute",
                    "bball-silvermine",
                    "--remote",
                    "--file",
                    os.path.relpath(batch, ROOT / "worker"),
                ],
                check=True,
                cwd=ROOT,
            )
            print(f"Imported basketball core batch {index}/{len(batches)}", flush=True)
    print(
        f"Prepared {len(batches)} basketball core batches for model {manifest['model_id']}"
    )


if __name__ == "__main__":
    main()
