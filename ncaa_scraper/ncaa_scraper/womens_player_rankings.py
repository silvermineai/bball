"""Build transparent, stat-by-stat women's basketball player leaderboards."""
"""Transparent women’s player ranking boards.

The source edition supplies one retained value per player/stat field.  Each
board is ranked independently and keeps the source-reported games field on
every row so a reader can inspect the qualification denominator.
"""

from __future__ import annotations

import math
from typing import Any


MIN_GAMES = 10
METRICS = {
    "scoring": ("Scoring", "avgPoints", "PPG"),
    "rebounding": ("Rebounding", "avgRebounds", "RPG"),
    "playmaking": ("Playmaking", "avgAssists", "APG"),
    "steals": ("Steals", "avgSteals", "SPG"),
    "blocks": ("Blocks", "avgBlocks", "BPG"),
    "field_goal": ("Field goal percentage", "fieldGoalPct", "FG%"),
    "three_point": ("Three-point percentage", "threePointFieldGoalPct", "3P%"),
}


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def build_rankings(players: list[dict[str, Any]]) -> dict[str, Any]:
    """Build independently ranked boards from retained source player rows."""

    leaderboards: dict[str, dict[str, Any]] = {}
    coverage: dict[str, dict[str, int]] = {}
    for key, (label, stat, unit) in METRICS.items():
        rows: list[dict[str, Any]] = []
        observed = 0
        for player in players:
            stats = player.get("stats") or {}
            value = _number(stats.get(stat))
            if value is None:
                continue
            observed += 1
            games = _number(stats.get("gamesPlayed"))
            if games is None or games < MIN_GAMES:
                continue
            rows.append(
                {
                    "player_id": str(player.get("player_id") or ""),
                    "name": str(player.get("name") or "Unknown player"),
                    "team": str(player.get("team") or "Unknown team"),
                    "position": str(player.get("position") or ""),
                    "games": int(games) if games.is_integer() else games,
                    "value": round(value, 2),
                }
            )
        rows.sort(key=lambda row: (-row["value"], row["name"], row["player_id"]))
        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank
        leaderboards[key] = {"label": label, "stat": stat, "unit": unit, "rows": rows}
        coverage[key] = {"observed": observed, "qualified": len(rows)}

    return {
        "min_games": MIN_GAMES,
        "metrics": {key: list(spec) for key, spec in METRICS.items()},
        "qualification": {
            "field": "gamesPlayed",
            "minimum": MIN_GAMES,
            "scope": "source-reported player-season field",
            "schedule_reconciled": False,
        },
        "coverage": coverage,
        "leaderboards": leaderboards,
    }
from __future__ import annotations

import math
from typing import Any

MIN_GAMES = 10

METRICS = {
    "scoring": {"label": "Scoring", "stat": "avgPoints", "unit": "PPG"},
    "rebounding": {"label": "Rebounding", "stat": "avgRebounds", "unit": "RPG"},
    "playmaking": {"label": "Playmaking", "stat": "avgAssists", "unit": "APG"},
    "steals": {"label": "Steals", "stat": "avgSteals", "unit": "SPG"},
    "blocks": {"label": "Blocks", "stat": "avgBlocks", "unit": "BPG"},
    "field_goal": {"label": "Field goal shooting", "stat": "fieldGoalPct", "unit": "%"},
    "three_point": {"label": "Three-point shooting", "stat": "threePointFieldGoalPct", "unit": "%"},
}


def _finite(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def build_rankings(players: list[dict[str, Any]], min_games: int = MIN_GAMES) -> dict[str, Any]:
    """Return independent leaderboards without inventing a composite player grade."""
    leaderboards: dict[str, Any] = {}
    coverage: dict[str, dict[str, int]] = {}
    for key, metric in METRICS.items():
        observed = 0
        rows: list[dict[str, Any]] = []
        for player in players:
            stats = player.get("stats") or {}
            value = _finite(stats.get(metric["stat"]))
            games = _finite(stats.get("gamesPlayed"))
            if value is None:
                continue
            observed += 1
            if games is None or games < min_games:
                continue
            rows.append({
                "player_id": str(player.get("player_id") or ""),
                "name": player.get("name") or "Unknown player",
                "team": player.get("team") or "Unknown team",
                "position": player.get("position") or "",
                "games": int(games),
                "value": round(value, 3),
            })
        rows.sort(key=lambda row: (-row["value"], row["name"].casefold(), row["player_id"]))
        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank
        coverage[key] = {"observed": observed, "qualified": len(rows)}
        leaderboards[key] = {"label": metric["label"], "stat": metric["stat"], "unit": metric["unit"], "rows": rows}
    return {"min_games": min_games, "metrics": METRICS, "coverage": coverage, "leaderboards": leaderboards}
