"""Extend attributed historical player statistics without rebuilding forecasts."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import re
import sqlite3
from pathlib import Path

from .football import DB_PATH, player_board, read_stats, store_rows
from .football_sources import CACHE, DATASETS, RELEASES, ROOT, ReleaseClient

# SportsDataverse's public football player releases are available back to 2018.
# Keep this archive independent from the forecast model's 2022+ evaluation window.
YEARS = tuple(range(2018, 2025))
KINDS = ("box", "passing", "rushing", "receiving", "defense", "specialists")
LOCAL = ROOT / ".local/football-player-history"
OUT = ROOT / "frontend/public/data/football"
IMPLEMENTATIONS = ("football_player_history.py", "football.py", "football_sources.py")


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_source(dataset, year, rows, receipt, games, teams, cache=CACHE):
    if dataset not in KINDS or year not in YEARS:
        raise ValueError("Outside historical player import scope")
    tag, pattern = DATASETS[dataset]
    filename = pattern.format(year=year)
    if (
        receipt["dataset"] != dataset
        or receipt["season"] != year
        or receipt["url"] != f"{RELEASES}/{tag}/{filename}"
        or sha(cache / filename) != receipt["sha256"]
    ):
        raise ValueError("Cached source or receipt mismatch")
    if not rows:
        raise ValueError("Empty historical source")
    team_key = (
        "def_pos_team_id"
        if dataset == "defense"
        else "pos_team_id"
        if dataset == "specialists"
        else "team_id"
    )
    athlete_key = "athlete_id" if dataset == "box" else "player_id"
    event = dataset in ("defense", "specialists")
    columns = {
        "season",
        team_key,
        "game_id" if dataset == "box" or event else athlete_key,
    }
    if not event:
        columns.add(athlete_key)
    if dataset == "box":
        columns.add("category")
    if dataset in ("passing", "rushing", "receiving"):
        columns.update(("TEPA", "EPAplay", "plays", "yards", "division"))
    seen = set()
    for row in rows:
        if not columns.issubset(row) or row.get("season") != str(year):
            raise ValueError("Missing fields or mixed-season source")
        if not re.fullmatch(r"[1-9]\d{0,14}", row.get(team_key) or ""):
            raise ValueError("Missing or malformed team identity")
        if not event:
            aid = row.get(athlete_key) or ""
            name = next(
                (
                    v
                    for k, v in row.items()
                    if k == "athlete_name" or k.endswith("player_name")
                ),
                "",
            )
            valid = bool(re.fullmatch(r"[1-9]\d{0,14}", aid))
            placeholder = (
                bool(re.fullmatch(r"-[1-9]\d{0,14}", aid))
                # Older publisher editions spell the synthetic row as either
                # "TEAM", " Team", or "- Team". All are team aggregates,
                # never athlete identities.
                and name.strip().lstrip("-").strip().lower() == "team"
            )
            if not (valid or placeholder):
                raise ValueError("Missing or malformed athlete identity")
        if row[team_key] not in teams:
            raise ValueError("Team is absent from historical directory")
        if dataset == "box" or event:
            game = games.get(row.get("game_id"))
            if (
                not game
                or game["season"] != year
                or row[team_key] not in (game["home_id"], game["away_id"])
            ):
                raise ValueError("Historical game/team/season mismatch")
        key = (row.get("player_name") if event else row[athlete_key], row[team_key])
        if dataset == "box" or event:
            key += (row["game_id"],)
        if dataset == "box":
            key += (row["category"],)
        if key in seen:
            raise ValueError("Duplicate source player/team/category identity")
        seen.add(key)
    return filename


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_sql(conn, path, dataset, year):
    if dataset not in KINDS or year not in YEARS:
        raise ValueError("Outside historical player import scope")
    with path.open("w") as f:
        f.write(
            f"DELETE FROM football_stats WHERE dataset={sql_value(dataset)} AND season={year};\n"
        )
        for row in conn.execute(
            "SELECT * FROM football_stats WHERE dataset=? AND season=? ORDER BY record_key",
            (dataset, year),
        ):
            statement = (
                "INSERT INTO football_stats VALUES ("
                + ",".join(map(sql_value, row))
                + ");\n"
            )
            if len(statement.encode()) > 95000:
                raise ValueError("Source record exceeds bounded SQL statement size")
            f.write(statement)
        receipt = conn.execute(
            "SELECT * FROM football_sources WHERE dataset=? AND season=?",
            (dataset, year),
        ).fetchone()
        f.write(
            "INSERT OR REPLACE INTO football_sources VALUES ("
            + ",".join(map(sql_value, receipt))
            + ");\n"
        )


def athlete_board(conn, year):
    board = player_board(conn, year)
    old_count = len(board["players"])
    board["players"] = [
        p for p in board["players"] if re.fullmatch(r"[1-9]\d{0,14}", p["id"])
    ]
    for category in board["rankings"]:
        ranked = [
            (p, p["production"][category])
            for p in board["players"]
            if p["production"].get(category, {}).get("rank") is not None
        ]
        ranked.sort(
            key=lambda pair: (-pair[1]["epa"], pair[0]["id"], pair[0]["team_id"])
        )
        for i, (_, data) in enumerate(ranked):
            data["rank"] = i + 1
        board["rankings"][category]["qualified"] = len(ranked)
    board["excluded_team_placeholder_entries"] = old_count - len(board["players"])
    return board


def make_catalog(conn, out):
    seasons = []
    for (year,) in conn.execute(
        "SELECT season FROM football_sources WHERE dataset='box' ORDER BY season"
    ):
        path = out / f"players-{year}.json"
        board = json.loads(path.read_text())
        if board["season"] != year:
            raise ValueError("Player board season mismatch")
        boxes = read_stats(conn, "box", year)
        receipts = [
            json.loads(r[0])
            for r in conn.execute(
                "SELECT receipt_json FROM football_sources WHERE season=? AND dataset IN ('box','passing','rushing','receiving','teams','schedule') ORDER BY dataset",
                (year,),
            )
        ]
        seasons.append(
            {
                "season": year,
                "file": path.name,
                "sha256": sha(path),
                "player_team_records": len(board["players"]),
                "box_rows": len(boxes),
                "team_placeholder_box_rows": sum(
                    r.get("athlete_id", "").startswith("-") for r in boxes
                ),
                "excluded_team_placeholder_entries": board[
                    "excluded_team_placeholder_entries"
                ],
                "box_games": len({r["game_id"] for r in boxes}),
                "completed_schedule_games": conn.execute(
                    "SELECT count(*) FROM football_games WHERE season=? AND completed=1",
                    (year,),
                ).fetchone()[0],
                "sources": receipts,
                "rankings": board["rankings"],
            }
        )
    result = {
        "seasons": seasons,
        "latest_source_retrieved_at": max(
            r["fetched_at"] for s in seasons for r in s["sources"]
        ),
        "limitations": [
            "Coverage varies by season and division; retained source records are not a complete athlete or game census.",
            "Source athlete IDs and stat-season team IDs remain separate. Name-only event records are never attached to these player profiles.",
            "Offensive EPA and per-play statistics are retained publisher measures. Categories can overlap and must not be added together.",
        ],
    }
    result["edition"] = hashlib.sha256(encoded(result).encode()).hexdigest()
    (out / "player-catalog.json").write_text(encoded(result))
    return result


def import_history(conn, downloads, out=OUT, local=LOCAL, cache=CACHE):
    scopes = {(ds, y) for y in YEARS for ds in KINDS}
    if (
        len(downloads) != len(scopes)
        or {(ds, y) for ds, y, _, _ in downloads} != scopes
    ):
        raise ValueError("Require all eighteen historical source scopes")
    games = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM football_games")}
    dependencies = []
    for y in YEARS:
        for ds in ("teams", "schedule"):
            receipt = conn.execute(
                "SELECT receipt_json FROM football_sources WHERE dataset=? AND season=?",
                (ds, y),
            ).fetchone()
            if not receipt:
                raise ValueError(
                    "Historical team and schedule dependencies are required"
                )
            dependencies.append(json.loads(receipt[0]))
    # Validate the complete release before any warehouse or public mutation.
    for ds, y, rows, receipt in downloads:
        teams = {r["team_id"] for r in read_stats(conn, "teams", y)}
        validate_source(ds, y, rows, receipt, games, teams, cache=cache)
    staged = sqlite3.connect(":memory:")
    staged.row_factory = sqlite3.Row
    conn.backup(staged)
    for ds, y, rows, receipt in downloads:
        store_rows(staged, ds, y, rows, receipt)
    boards = {
        y: athlete_board(staged, y)
        for (y,) in staged.execute(
            "SELECT season FROM football_sources WHERE dataset='box' ORDER BY season"
        )
    }
    local.mkdir(parents=True, exist_ok=True)
    sources = []
    for ds, y, rows, receipt in downloads:
        path = local / f"{ds}-{y}.sql"
        write_sql(staged, path, ds, y)
        sources.append(
            {
                "dataset": ds,
                "season": y,
                "records": len(rows),
                "receipt": receipt,
                "sql": path.name,
                "sql_sha256": sha(path),
            }
        )
    with conn:
        for ds, y, _, receipt in downloads:
            conn.execute(
                "DELETE FROM football_stats WHERE dataset=? AND season=?", (ds, y)
            )
            conn.executemany(
                "INSERT INTO football_stats VALUES (?,?,?,?,?,?,?,?)",
                [
                    tuple(r)
                    for r in staged.execute(
                        "SELECT * FROM football_stats WHERE dataset=? AND season=?",
                        (ds, y),
                    )
                ],
            )
            conn.execute(
                "INSERT OR REPLACE INTO football_sources VALUES (?,?,?)",
                (ds, y, json.dumps(receipt)),
            )
    staged.close()
    out.mkdir(parents=True, exist_ok=True)
    for y, board in boards.items():
        (out / f"players-{y}.json").write_text(encoded(board))
    catalog = make_catalog(conn, out)
    manifest = {
        "sources": sources,
        "dependencies": dependencies,
        "catalog_edition": catalog["edition"],
        "files": {
            name: sha(out / name)
            for name in [
                "player-catalog.json",
                *[s["file"] for s in catalog["seasons"]],
            ]
        },
        "implementation_sha256": {
            name: sha(Path(__file__).with_name(name)) for name in IMPLEMENTATIONS
        },
    }
    (local / "manifest.json").write_text(encoded(manifest))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    LOCAL.mkdir(parents=True, exist_ok=True)
    with (LOCAL / "import.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        client = ReleaseClient()
        downloads = [
            (ds, y, *client.load(ds, y, refresh=args.refresh))
            for y in YEARS
            for ds in KINDS
        ]
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            result = import_history(conn, downloads)
        print(
            encoded(
                {
                    "catalog_edition": result["catalog_edition"],
                    "sources": [
                        {k: s[k] for k in ("dataset", "season", "records")}
                        for s in result["sources"]
                    ],
                }
            )
        )


if __name__ == "__main__":
    main()
