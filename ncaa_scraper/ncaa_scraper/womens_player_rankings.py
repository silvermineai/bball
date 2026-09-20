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
    # Keep a volume lens beside the per-game lens.  ``points`` is the
    # publisher-reported season total, so this does not manufacture a total
    # from a rounded average.  The retained games denominator stays on every
    # row for review.
    "scoring_volume": ("Scoring volume", "points", "PTS"),
    "rebounding": ("Rebounding", "avgRebounds", "RPG"),
    "playmaking": ("Playmaking", "avgAssists", "APG"),
    "steals": ("Steals", "avgSteals", "SPG"),
    "blocks": ("Blocks", "avgBlocks", "BPG"),
    "field_goal": ("Field goal percentage", "fieldGoalPct", "FG%"),
    "three_point": ("Three-point percentage", "threePointFieldGoalPct", "3P%"),
}

METRIC_DESCRIPTIONS = {
    "scoring": "Source-reported points per game.",
    "scoring_volume": "Source-reported season points total; games remain attached as the denominator context.",
    "rebounding": "Source-reported rebounds per game.",
    "playmaking": "Source-reported assists per game.",
    "steals": "Source-reported steals per game.",
    "blocks": "Source-reported blocks per game.",
    "field_goal": "Source-reported field-goal percentage.",
    "three_point": "Source-reported three-point percentage.",
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
        leaderboards[key] = {
            "label": label,
            "stat": stat,
            "unit": unit,
            "description": METRIC_DESCRIPTIONS[key],
            "rows": rows,
        }
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
