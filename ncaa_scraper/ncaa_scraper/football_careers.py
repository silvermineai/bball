"""Build a compact, source-preserving football player career index.

The season player indexes are the authoritative records. This layer only
aggregates identified rows by source athlete ID so a reader can find a player
across seasons; it does not infer transfers, merge names, or create a value
metric across unrelated source categories.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend/public/data/football"
CATEGORIES = (
    "passing",
    "rushing",
    "receiving",
    "defensive",
    "interceptions",
    "fumbles",
    "kicking",
    "punting",
    "kickReturns",
    "puntReturns",
)


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _integer(value):
    number = _number(value)
    return int(number) if number is not None and number.is_integer() else None


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def build(rows: Iterable[dict], seasons: Iterable[int], generated_at: str | None = None):
    """Return a career index from season-level player rows.

    Only positive source athlete IDs are accepted. Production totals are
    additive within a named source category, while EPA/play is recalculated
    from the retained EPA and play totals. Categories are never combined.
    """

    careers: dict[str, dict] = {}
    source_records = 0
    production_records = 0
    season_values = sorted({int(s) for s in seasons})
    for row in rows:
        player_id = _text(row.get("id"))
        if not player_id or player_id.startswith("-"):
            continue
        season = _integer(row.get("season"))
        if season is None:
            continue
        source_records += 1
        career = careers.setdefault(
            player_id,
            {
                "id": player_id,
                "name": _text(row.get("name")) or player_id,
                "seasons": set(),
                "teams": {},
                "categories": set(),
                "production": {},
                "box_games": 0,
            },
        )
        # Prefer the latest non-empty display name without treating a spelling
        # change as proof that two source identities are the same person.
        if _text(row.get("name")):
            career["name"] = _text(row["name"])
        career["seasons"].add(season)
        career["box_games"] += _integer(row.get("box_games")) or 0
        team_id = _text(row.get("team_id")) or "unknown"
        team_key = (season, team_id)
        career["teams"].setdefault(
            team_key,
            {
                "season": season,
                "team_id": team_id,
                "team": _text(row.get("team")) or team_id,
                "conference": _text(row.get("conference")),
                "division": _text(row.get("division")),
                "box_games": _integer(row.get("box_games")) or 0,
            },
        )
        for category, stats in (row.get("production") or {}).items():
            if category not in CATEGORIES or not isinstance(stats, dict):
                continue
            plays = _number(stats.get("plays"))
            yards = _number(stats.get("yards"))
            epa = _number(stats.get("epa"))
            touchdowns = _number(stats.get("touchdowns"))
            rank = _integer(stats.get("rank"))
            if plays is None and yards is None and epa is None and touchdowns is None:
                continue
            production_records += 1
            career["categories"].add(category)
            target = career["production"].setdefault(
                category,
                {
                    "plays": 0.0,
                    "yards": 0.0,
                    "epa": 0.0,
                    "touchdowns": 0.0,
                    "seasons": set(),
                    "best_rank": None,
                },
            )
            for key, value in (
                ("plays", plays),
                ("yards", yards),
                ("epa", epa),
                ("touchdowns", touchdowns),
            ):
                if value is not None:
                    target[key] += value
            target["seasons"].add(season)
            if rank is not None and rank > 0:
                target["best_rank"] = min(
                    rank, target["best_rank"] or rank
                )

    output = []
    for career in careers.values():
        seasons_seen = sorted(career["seasons"])
        production = {}
        for category in sorted(career["production"]):
            item = career["production"][category]
            plays = item["plays"]
            production[category] = {
                "plays": int(plays) if plays.is_integer() else plays,
                "yards": int(item["yards"]) if item["yards"].is_integer() else item["yards"],
                "epa": round(item["epa"], 6),
                "epa_per_play": round(item["epa"] / plays, 8) if plays > 0 else None,
                "touchdowns": int(item["touchdowns"]) if item["touchdowns"].is_integer() else item["touchdowns"],
                "seasons": sorted(item["seasons"]),
                "best_rank": item["best_rank"],
            }
        output.append(
            {
                "id": career["id"],
                "name": career["name"],
                "first_season": seasons_seen[0],
                "last_season": seasons_seen[-1],
                "seasons": seasons_seen,
                "season_count": len(seasons_seen),
                "box_games": career["box_games"],
                "categories": sorted(career["categories"]),
                "teams": sorted(career["teams"].values(), key=lambda t: (t["season"], t["team_id"])),
                "production": production,
            }
        )
    output.sort(key=lambda row: (row["name"].casefold(), row["id"]))
    return {
        "schema_version": 1,
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "coverage": {
            "seasons": season_values,
            "source_records": source_records,
            "player_count": len(output),
            "production_records": production_records,
            "identified_only": True,
        },
        "methodology": "Grouped season player indexes by their source athlete ID. Category totals are additive only within the named source category; no name-only identity joins, transfer inference or cross-category composite is created.",
        "players": output,
    }


def write(public: Path = PUBLIC) -> dict:
    rows = []
    seasons = []
    for path in sorted(public.glob("players-*.json")):
        payload = json.loads(path.read_text())
        rows.extend(payload.get("players", []))
        seasons.append(int(payload["season"]))
    result = build(rows, seasons)
    (public / "player-careers.json").write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        + "\n"
    )
    return result


if __name__ == "__main__":
    print(json.dumps(write()["coverage"], sort_keys=True))
