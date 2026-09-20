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

# The player-season release is a useful national leaderboard, but it is a
# bounded source edition.  The retained game box archive includes additional
# athletes (including players whose season aggregate was not in that release),
# so keep a second set of boards keyed to the exact box-score aggregates.
BOX_METRICS = {
    "scoring": ("Scoring", ("per_game", "points"), "PPG"),
    "scoring_volume": ("Scoring volume", ("totals", "points"), "PTS"),
    "rebounding": ("Rebounding", ("per_game", "rebounds"), "RPG"),
    "playmaking": ("Playmaking", ("per_game", "assists"), "APG"),
    "steals": ("Steals", ("per_game", "steals"), "SPG"),
    "blocks": ("Blocks", ("per_game", "blocks"), "BPG"),
    "field_goal": ("Field goal percentage", ("shooting", "field_goal_pct"), "FG%"),
    "three_point": ("Three-point percentage", ("shooting", "three_point_pct"), "3P%"),
    "free_throw": ("Free-throw percentage", ("shooting", "free_throw_pct"), "FT%"),
}

BOX_METRIC_DESCRIPTIONS = {
    "scoring": "Arithmetic average of points from played source box rows.",
    "scoring_volume": "Sum of points from played source box rows; games remain attached as denominator context.",
    "rebounding": "Arithmetic average of rebounds from played source box rows.",
    "playmaking": "Arithmetic average of assists from played source box rows.",
    "steals": "Arithmetic average of steals from played source box rows.",
    "blocks": "Arithmetic average of blocks from played source box rows.",
    "field_goal": "Field goals made divided by field-goal attempts in played source box rows.",
    "three_point": "Three-point makes divided by three-point attempts in played source box rows.",
    "free_throw": "Free throws made divided by free-throw attempts in played source box rows.",
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


def build_box_rankings(
    players: list[dict[str, Any]],
    min_games: int = MIN_GAMES,
) -> dict[str, Any]:
    """Build boards from the retained game-box aggregate publication.

    ``players`` must already be aggregated by exact source athlete ID.  DNP
    rows are excluded by the publisher before these aggregates are built;
    this function never treats a missing box value as zero and never joins by
    player name.  The result intentionally mirrors ``build_rankings`` so the
    UI can offer a larger, box-score-backed cohort without replacing the
    source-native player-season edition.
    """

    if not isinstance(min_games, int) or isinstance(min_games, bool) or min_games < 1:
        raise ValueError("min_games must be a positive integer")

    leaderboards: dict[str, dict[str, Any]] = {}
    coverage: dict[str, dict[str, int]] = {}
    for key, (label, path, unit) in BOX_METRICS.items():
        rows: list[dict[str, Any]] = []
        observed = 0
        for player in players:
            section = player.get(path[0]) or {}
            value = _number(section.get(path[1])) if isinstance(section, dict) else None
            if value is None:
                continue
            observed += 1
            games = _number(player.get("games_played"))
            if games is None or games < min_games:
                continue
            rows.append(
                {
                    "player_id": str(player.get("player_id") or ""),
                    "name": str(player.get("name") or "Unknown player"),
                    "team": str(player.get("team") or "Unknown team"),
                    "team_id": str(player.get("team_id") or ""),
                    "position": str(player.get("position") or ""),
                    "games": int(games) if games.is_integer() else games,
                    "value": round(value, 2),
                    "box_rows": int(player.get("box_rows") or 0),
                }
            )
        rows.sort(key=lambda row: (-row["value"], row["name"], row["player_id"]))
        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank
        leaderboards[key] = {
            "label": label,
            "stat": f"{path[0]}.{path[1]}",
            "unit": unit,
            "description": BOX_METRIC_DESCRIPTIONS[key],
            "rows": rows,
        }
        coverage[key] = {"observed": observed, "qualified": len(rows)}

    return {
        "min_games": min_games,
        "metrics": {key: [spec[0], f"{spec[1][0]}.{spec[1][1]}", spec[2]] for key, spec in BOX_METRICS.items()},
        "qualification": {
            "field": "games_played",
            "minimum": min_games,
            "scope": "played source box rows aggregated by exact athlete ID",
            "schedule_reconciled": False,
            "dnp_excluded": True,
        },
        "coverage": coverage,
        "leaderboards": leaderboards,
    }
