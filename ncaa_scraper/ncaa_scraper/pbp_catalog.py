"""Build a compact, source-audited index of attributed basketball PBP files."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pyarrow.parquet as pq

from .basketball_sources import client
from .bulk_parquet import parquet_file
from .football_sources import ROOT, utcnow

OUT = ROOT / "frontend/public/data/basketball/pbp-catalog.json"
PBP_COLUMNS = [
    "id",
    "game_id",
    "season",
    "scoring_play",
    "shooting_play",
    "home_team_id",
    "away_team_id",
    "home_team_name",
    "away_team_name",
    "game_date",
    "game_date_time",
]


def _text(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def index(path: Path, receipt: dict, season: int) -> dict:
    """Count events by source game without copying event text to the client."""
    games: dict[str, dict] = {}
    teams: set[str] = set()
    events = 0
    for batch in pq.ParquetFile(path).iter_batches(batch_size=8192, columns=PBP_COLUMNS):
        for row in batch.to_pylist():
            if row.get("season") != season or row.get("game_id") is None:
                continue
            game_id = str(row["game_id"])
            game = games.setdefault(
                game_id,
                {
                    "id": game_id,
                    "date": _text(row.get("game_date_time") or row.get("game_date")),
                    "home": _text(row.get("home_team_name")),
                    "away": _text(row.get("away_team_name")),
                    "events": 0,
                    "scoring_plays": 0,
                    "shooting_plays": 0,
                    "completed": True,
                    "matched_schedule": False,
                },
            )
            game["events"] += 1
            game["scoring_plays"] += int(row.get("scoring_play") is True)
            game["shooting_plays"] += int(row.get("shooting_play") is True)
            for key in ("home_team_id", "away_team_id"):
                value = row.get(key)
                if value is not None:
                    game[key.removesuffix("_team_id") + "_id"] = str(value)
                    teams.add(str(value))
            events += 1
    ordered = sorted(
        games.values(),
        key=lambda game: (game.get("date") or "", game["id"]),
        reverse=True,
    )
    edition = hashlib.sha256(
        json.dumps(
            {"pbp": receipt["sha256"], "season": season, "version": 1},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    return {
        "season": season,
        "generated_at": utcnow(),
        "source": receipt,
        "coverage": {
            "edition": edition,
            "source_events": events,
            "source_games": len(ordered),
            "pbp_events": events,
            "pbp_games": len(ordered),
            "teams": len(teams),
            "field_goal_attempts": None,
        },
        "games": ordered,
    }


def merge_with_shooting(indexes: list[dict], previous: dict | None) -> dict:
    """Keep reconciled shot counts for seasons already processed by shooting."""
    previous_by_season = {item["season"]: item for item in (previous or {}).get("seasons", [])}
    merged = []
    for current in indexes:
        old = previous_by_season.get(current["season"])
        if not old:
            merged.append(current)
            continue
        old_games = {game["id"]: game for game in old.get("games", [])}
        for game in current["games"]:
            prior = old_games.get(game["id"])
            if prior:
                for key in ("shot_attempts", "home_id", "away_id", "completed", "matched_schedule"):
                    if key in prior:
                        game[key] = prior[key]
        current["coverage"] = {**current["coverage"], **old.get("coverage", {})}
        merged.append(current)
    return {
        "schema_version": 1,
        "default_season": max(item["season"] for item in merged),
        "seasons": merged,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, nargs="+", default=list(range(2019, 2027)))
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    indexes = []
    source_client = client()
    for season in sorted(set(args.seasons)):
        path, receipt = parquet_file(source_client, "pbp", season, args.refresh)
        result = index(path, receipt, season)
        indexes.append(result)
        print(json.dumps({"season": season, **result["coverage"]}), flush=True)
    previous = json.loads(OUT.read_text()) if OUT.exists() else None
    OUT.write_text(json.dumps(merge_with_shooting(indexes, previous), separators=(",", ":"), allow_nan=False))
    print(json.dumps({"seasons": [item["season"] for item in indexes], "output": str(OUT)}))


if __name__ == "__main__":
    main()
