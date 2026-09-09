"""Build source-attributed NCAA team possession-style profiles.

The release contains one row per recorded possession. This module keeps the
source identity and aggregates only team-season context; it does not assign a
possession to an individual player or feed the descriptive rates into the
forecast model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

from .basketball_sources import BASKETBALL_ATTRIBUTION, client
from .bulk_parquet import parquet_file
from .football_sources import ROOT, utcnow

DB = ROOT / ".local/basketball.sqlite3"
OUT = ROOT / "frontend/public/data/basketball/ncaa-possession-style.json"
MIGRATION = ROOT / "worker/migrations/0027_basketball_possession_style.sql"
VERSION = 1


def _text(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _sql(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _team_key(row: dict, side: str) -> tuple[str, str] | None:
    espn = _text(row.get(f"{side}_espn_team_id"))
    ncaa = _text(row.get(f"{side}_ncaa_team_id"))
    if espn:
        return espn, _text(row.get(side)) or espn
    if ncaa:
        return f"ncaa:{ncaa}", _text(row.get(side)) or ncaa
    return None


def build_season(path: Path, receipt: dict, season: int) -> dict:
    """Aggregate possession flags without inventing player-level credit."""
    teams: dict[str, dict] = {}
    columns = [
        "contest_id", "poss_team_espn_team_id", "poss_team_ncaa_team_id",
        "home_espn_team_id", "away_espn_team_id", "home_ncaa_team_id",
        "away_ncaa_team_id", "home", "away", "poss_team", "pts", "is_transition",
        "is_assisted", "is_garbage_time", "season",
    ]
    source_rows = 0
    for batch in pq.ParquetFile(path).iter_batches(batch_size=16384, columns=columns):
        for row in batch.to_pylist():
            if _int(row.get("season")) != season:
                continue
            espn = _text(row.get("poss_team_espn_team_id"))
            ncaa = _text(row.get("poss_team_ncaa_team_id"))
            if espn:
                team_id = espn
            elif ncaa:
                team_id = f"ncaa:{ncaa}"
            else:
                continue
            team_name = _text(row.get("poss_team"))
            if not team_name:
                for side in ("home", "away"):
                    key = _team_key(row, side)
                    if key and key[0] == team_id:
                        team_name = key[1]
                        break
            team_name = team_name or team_id
            entry = teams.setdefault(
                team_id,
                {
                    "team_id": team_id,
                    "team": team_name,
                    "games": set(),
                    "possessions": 0,
                    "points": 0,
                    "transition_possessions": 0,
                    "assisted_possessions": 0,
                    "garbage_possessions": 0,
                },
            )
            if not entry["team"] or entry["team"] == team_id:
                entry["team"] = team_name
            contest = _text(row.get("contest_id"))
            if contest:
                entry["games"].add(contest)
            entry["possessions"] += 1
            entry["points"] += max(0, _int(row.get("pts")) or 0)
            entry["transition_possessions"] += int(_int(row.get("is_transition")) == 1)
            entry["assisted_possessions"] += int(_int(row.get("is_assisted")) == 1)
            entry["garbage_possessions"] += int(_int(row.get("is_garbage_time")) == 1)
            source_rows += 1

    output = []
    for team_id, entry in teams.items():
        games = len(entry["games"])
        possessions = entry["possessions"]
        output.append(
            {
                "team_id": team_id,
                "team": entry["team"],
                "games": games,
                "possessions": possessions,
                "points": entry["points"],
                "transition_possessions": entry["transition_possessions"],
                "assisted_possessions": entry["assisted_possessions"],
                "garbage_time_possessions": entry["garbage_possessions"],
                "points_per_possession": round(entry["points"] / possessions, 4) if possessions else None,
                "possessions_per_game": round(possessions / games, 2) if games else None,
                "transition_share": round(entry["transition_possessions"] / possessions, 4) if possessions else None,
                "assisted_share": round(entry["assisted_possessions"] / possessions, 4) if possessions else None,
                "garbage_time_share": round(entry["garbage_possessions"] / possessions, 4) if possessions else None,
            }
        )
    output.sort(key=lambda row: (-row["possessions"], row["team"], row["team_id"]))
    edition = hashlib.sha256(
        json.dumps({"version": VERSION, "season": season, "source": receipt["sha256"]}, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "season": season,
        "edition": edition,
        "generated_at": utcnow(),
        "source": receipt,
        "coverage": {"source_rows": source_rows, "teams": len(output), "games": sum(row["games"] for row in output)},
        "teams": output,
    }


def write_sql(editions: list[dict], path: Path) -> None:
    statements = [
        MIGRATION.read_text(),
        "\n".join(
            f"DELETE FROM bb_possession_style WHERE season={edition['season']};"
            for edition in editions
        ),
    ]
    for edition in editions:
        for row in edition["teams"]:
            style = json.dumps(
                {
                    "points_per_possession": row["points_per_possession"],
                    "possessions_per_game": row["possessions_per_game"],
                    "transition_share": row["transition_share"],
                    "assisted_share": row["assisted_share"],
                    "garbage_time_share": row["garbage_time_share"],
                },
                separators=(",", ":"),
                allow_nan=False,
            )
            statements.append(
                "INSERT OR REPLACE INTO bb_possession_style "
                "(season,team_id,team_name,games,possessions,points,transition_possessions,assisted_possessions,garbage_possessions,style_json) VALUES ("
                + ",".join(
                    _sql(value)
                    for value in (
                        edition["season"], row["team_id"], row["team"], row["games"],
                        row["possessions"], row["points"],
                        row["transition_possessions"], row["assisted_possessions"],
                        row["garbage_time_possessions"], style,
                    )
                )
                + ");"
            )
    path.write_text("\n".join(statements) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, nargs="+", default=list(range(2019, 2027)))
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--sql", action="store_true")
    args = parser.parse_args()
    if any(season < 2010 or season > 2026 for season in args.seasons):
        parser.error("Use published season-ending years 2010–2026")
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.executescript(MIGRATION.read_text())
    source_client = client()
    editions = []
    for season in sorted(set(args.seasons)):
        parquet, receipt = parquet_file(source_client, "ncaa_possessions", season, args.refresh)
        receipt = {**receipt, "dataset": "ncaa_possessions", "season": season}
        conn.execute(
            "INSERT OR REPLACE INTO bb_sources(dataset,season,receipt_json) VALUES (?,?,?)",
            ("ncaa_possessions", season, json.dumps(receipt, separators=(",", ":"))),
        )
        edition = build_season(parquet, receipt, season)
        editions.append(edition)
        conn.execute("DELETE FROM bb_possession_style WHERE season=?", (season,))
        for row in edition["teams"]:
            style = {key: row[key] for key in ("points_per_possession", "possessions_per_game", "transition_share", "assisted_share", "garbage_time_share")}
            conn.execute(
                "INSERT OR REPLACE INTO bb_possession_style VALUES (?,?,?,?,?,?,?,?,?,?)",
                (season, row["team_id"], row["team"], row["games"], row["possessions"], row["points"], row["transition_possessions"], row["assisted_possessions"], row["garbage_time_possessions"], json.dumps(style, separators=(",", ":"))),
            )
        print(json.dumps({"season": season, "coverage": edition["coverage"]}), flush=True)
    conn.commit()
    conn.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": VERSION, "generated_at": utcnow(), "attribution": BASKETBALL_ATTRIBUTION, "seasons": editions}, separators=(",", ":"), allow_nan=False))
    if args.sql:
        write_sql(editions, ROOT / ".local/basketball-possession-style.sql")


if __name__ == "__main__":
    main()
