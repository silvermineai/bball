#!/usr/bin/env python3
"""Validate the joins that make an upcoming basketball forecast actionable.

Primary forecasts must carry both team profiles, historical player workload,
all four matchup factors, and a roster-continuity scenario. The published score,
margin, total, factor edges, and roster scenario must agree with one another.
Cold-start rows remain valid when those contextual joins are unavailable, but
they must carry an explicit fallback estimate so the UI can disclose the
reduced evidence.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ID_RE = re.compile(r"^\d{1,15}$")
FACTOR_KEYS = ("efg", "tov", "orb", "ftr")
PREDICTION_FIELDS = (
    "away_score",
    "home_score",
    "home_margin",
    "total",
    "pace",
    "home_win_probability",
    "margin_low",
    "margin_high",
)


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path} is not a JSON object")
    return value


def validate_prediction(value: Any, label: str) -> None:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is missing an estimate")
    for field in PREDICTION_FIELDS:
        if not finite(value.get(field)):
            raise ValueError(f"{label} has a non-numeric {field}")
    probability = value["home_win_probability"]
    if not 0 <= probability <= 1:
        raise ValueError(f"{label} has an invalid home win probability")
    if value["margin_low"] > value["margin_high"]:
        raise ValueError(f"{label} has an inverted margin interval")
    # These fields are published together. Catch a partial or mismatched
    # refresh before the UI turns them into a game plan.
    if abs((value["home_score"] - value["away_score"]) - value["home_margin"]) > 0.05:
        raise ValueError(f"{label} has a score/margin mismatch")
    if abs((value["home_score"] + value["away_score"]) - value["total"]) > 0.05:
        raise ValueError(f"{label} has a score/total mismatch")
    if value["pace"] <= 0:
        raise ValueError(f"{label} has a non-positive pace")


def validate_cold_start(
    prediction: Any,
    game_id: str,
    home_id: str,
    away_id: str,
    model_team_ids: set[str],
) -> None:
    validate_prediction(prediction, f"game {game_id} fallback prediction")
    if (
        not isinstance(prediction, dict)
        or prediction.get("estimate_type") != "cold_start"
    ):
        raise ValueError(f"game {game_id} fallback prediction is not labeled cold_start")
    unknown = prediction.get("unknown_teams")
    if (
        not isinstance(unknown, list)
        or any(
            not isinstance(team_id, str) or not ID_RE.fullmatch(team_id)
            for team_id in unknown
        )
        or len(unknown) != len(set(unknown))
    ):
        raise ValueError(f"game {game_id} fallback prediction has malformed unknown teams")
    expected = {
        team_id
        for team_id in (home_id, away_id)
        if team_id not in model_team_ids
    }
    if set(unknown) != expected:
        raise ValueError(
            f"game {game_id} fallback unknown teams do not match the model field"
        )


def validate_profile(path: Path, team_id: str, label: str) -> None:
    profile = read_json(path)
    if profile.get("id") != team_id or not isinstance(profile.get("players"), list):
        raise ValueError(f"{label} scouting profile has an invalid identity or player list")
    season = profile.get("season")
    if not isinstance(season, int):
        raise ValueError(f"{label} scouting profile has no season")
    workload = [
        player
        for player in profile["players"]
        if isinstance(player, dict)
        and player.get("team_id") == team_id
        and player.get("season") == season
        and finite(player.get("minutes"))
        and player["minutes"] >= 200
        and isinstance(player.get("games"), int)
        and player["games"] > 0
    ]
    if not workload:
        raise ValueError(f"{label} has no qualifying historical player workload")


def validate_team(rating: Any, team_id: str, label: str) -> None:
    if not isinstance(rating, dict) or str(rating.get("id")) != team_id:
        raise ValueError(f"{label} is missing its team rating")
    for field in ("adj_off", "adj_def", "adj_net", "adj_tempo"):
        if not finite(rating.get(field)):
            raise ValueError(f"{label} has a non-numeric {field}")


def validate_factors(game: dict[str, Any]) -> None:
    factors = game.get("matchup_factors")
    if not isinstance(factors, dict) or not isinstance(factors.get("factors"), dict):
        raise ValueError(f"game {game['id']} is missing matchup factors")
    if set(factors["factors"]) != set(FACTOR_KEYS):
        raise ValueError(f"game {game['id']} does not have all four matchup factors")
    for key in FACTOR_KEYS:
        values = factors["factors"].get(key)
        if not isinstance(values, dict) or any(not finite(values.get(field)) for field in ("home_offense", "home_defense", "away_offense", "away_defense")):
            raise ValueError(f"game {game['id']} has malformed {key} matchup values")
        edges = factors.get("edges")
        if not isinstance(edges, dict) or not finite(edges.get(key)):
            raise ValueError(f"game {game['id']} has a malformed {key} matchup edge")


def validate_scenario(
    scenario: Any,
    game_id: str,
    home_id: str,
    away_id: str,
    prediction: dict[str, Any],
    model_id: str,
    calibration: dict[str, Any],
) -> None:
    if not isinstance(scenario, dict) or str(scenario.get("game_id")) != game_id:
        raise ValueError(f"game {game_id} is missing its roster scenario")
    if str(scenario.get("home_id")) != home_id or str(scenario.get("away_id")) != away_id:
        raise ValueError(f"game {game_id} roster scenario has mismatched participants")
    for field in (
        "base_margin",
        "roster_margin",
        "margin_delta",
        "home_predicted_net",
        "away_predicted_net",
        "roster_home_win_probability",
        "roster_margin_low",
        "roster_margin_high",
    ):
        if not finite(scenario.get(field)):
            raise ValueError(f"game {game_id} has a non-numeric roster scenario {field}")
    if not 0 <= scenario["roster_home_win_probability"] <= 1:
        raise ValueError(f"game {game_id} roster scenario has an invalid win probability")
    if scenario.get("primary_model_id") != model_id:
        raise ValueError(f"game {game_id} roster scenario has a mismatched model ID")
    if abs(scenario["base_margin"] - prediction["home_margin"]) > 0.05:
        raise ValueError(f"game {game_id} roster scenario is based on a different forecast margin")
    if abs((scenario["roster_margin"] - scenario["base_margin"]) - scenario["margin_delta"]) > 0.05:
        raise ValueError(f"game {game_id} roster scenario has a margin-delta mismatch")
    if not scenario["roster_margin_low"] <= scenario["roster_margin"] <= scenario["roster_margin_high"]:
        raise ValueError(f"game {game_id} roster scenario has a malformed margin range")
    coefficients = calibration.get("logistic_coefficients")
    width = calibration.get("margin_half_width")
    if not isinstance(coefficients, list) or len(coefficients) != 2 or not finite(width):
        raise ValueError(f"game {game_id} cannot verify roster scenario calibration")
    intercept, slope = coefficients
    if not finite(intercept) or not finite(slope):
        raise ValueError(f"game {game_id} cannot verify roster scenario probability")
    expected_probability = 1 / (1 + math.exp(-max(-30, min(30, intercept + slope * scenario["roster_margin"]))))
    if abs(scenario["roster_home_win_probability"] - expected_probability) > 0.00002:
        raise ValueError(f"game {game_id} roster scenario probability disagrees with primary calibration")
    if (
        abs(scenario["roster_margin_low"] - (scenario["roster_margin"] - width)) > 0.02
        or abs(scenario["roster_margin_high"] - (scenario["roster_margin"] + width)) > 0.02
    ):
        raise ValueError(f"game {game_id} roster scenario range disagrees with primary calibration")


def check(root: Path) -> dict[str, Any]:
    basketball = root / "frontend" / "public" / "data" / "basketball"
    overview = read_json(basketball / "overview.json")
    games = overview.get("upcoming")
    ratings = overview.get("ratings")
    if not isinstance(games, list) or not games:
        raise ValueError("overview has no upcoming basketball games")
    if not isinstance(ratings, list) or not ratings:
        raise ValueError("overview has no team ratings")
    model = overview.get("model")
    model_teams = model.get("teams") if isinstance(model, dict) else None
    if (
        not isinstance(model_teams, list)
        or not model_teams
        or any(
            not isinstance(team_id, str) or not ID_RE.fullmatch(team_id)
            for team_id in model_teams
        )
        or len(model_teams) != len(set(model_teams))
    ):
        raise ValueError("overview model has invalid or duplicate team IDs")
    model_team_ids = set(model_teams)
    rating_by_id = {str(row.get("id")): row for row in ratings if isinstance(row, dict)}
    roster_model = read_json(basketball / "roster-model.json")
    model_id = str(model.get("id", ""))
    calibration = model.get("calibration")
    if roster_model.get("primary_model_id") != model_id:
        raise ValueError("roster model does not identify the active primary model")
    if not isinstance(calibration, dict):
        raise ValueError("overview model has no calibration")
    scenarios = {}
    for row in roster_model.get("scenarios", []):
        if not isinstance(row, dict):
            raise ValueError("roster model contains a non-object scenario")
        scenario_id = str(row.get("game_id", ""))
        if scenario_id in scenarios:
            raise ValueError(f"roster model contains duplicate scenario ID: {scenario_id}")
        scenarios[scenario_id] = row
    seen: set[str] = set()
    primary = fallback = 0
    primary_context = {"team_ratings": 0, "scouting_profiles": 0, "player_workload": 0, "factors": 0, "roster_scenarios": 0}
    for game in games:
        if not isinstance(game, dict):
            raise ValueError("overview contains a non-object upcoming game")
        game_id = str(game.get("id", ""))
        if not ID_RE.fullmatch(game_id) or game_id in seen:
            raise ValueError(f"overview contains an invalid or duplicate game ID: {game_id!r}")
        seen.add(game_id)
        if not isinstance(game.get("starts_at"), str):
            raise ValueError(f"game {game_id} has no start timestamp")
        try:
            datetime.fromisoformat(game["starts_at"].replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"game {game_id} has an invalid start timestamp") from exc
        home_id, away_id = str(game.get("home_id", "")), str(game.get("away_id", ""))
        if not ID_RE.fullmatch(home_id) or not ID_RE.fullmatch(away_id) or home_id == away_id:
            raise ValueError(f"game {game_id} has invalid participants")
        if not str(game.get("home_name", "")).strip() or not str(game.get("away_name", "")).strip():
            raise ValueError(f"game {game_id} has an unnamed participant")
        if game.get("prediction") is not None and game.get("fallback_prediction") is not None:
            raise ValueError(f"game {game_id} has both primary and fallback predictions")
        if game.get("prediction") is not None:
            primary += 1
            validate_prediction(game["prediction"], f"game {game_id} primary prediction")
            validate_factors(game)
            for team_id, side in ((home_id, "home"), (away_id, "away")):
                validate_team(rating_by_id.get(team_id), team_id, f"game {game_id} {side} team")
                primary_context["team_ratings"] += 1
                profile_path = basketball / "scouting" / f"{team_id}.json"
                if not profile_path.exists():
                    raise ValueError(f"game {game_id} {side} team has no scouting profile")
                validate_profile(profile_path, team_id, f"game {game_id} {side} team")
                primary_context["scouting_profiles"] += 1
                primary_context["player_workload"] += 1
            validate_scenario(
                scenarios.get(game_id),
                game_id,
                home_id,
                away_id,
                game["prediction"],
                model_id,
                calibration,
            )
            primary_context["roster_scenarios"] += 1
            primary_context["factors"] += 1
        elif game.get("fallback_prediction") is not None:
            fallback += 1
            fallback_prediction = game["fallback_prediction"]
            validate_cold_start(
                fallback_prediction,
                game_id,
                home_id,
                away_id,
                model_team_ids,
            )
        else:
            raise ValueError(f"game {game_id} has neither a primary nor fallback prediction")
    expected = overview.get("coverage", {})
    expected_primary = expected.get("forecast_games")
    expected_fallback = expected.get("baseline_estimate_games")
    if isinstance(expected_primary, int) and expected_primary != primary:
        raise ValueError(f"coverage says {expected_primary} primary games but found {primary}")
    if isinstance(expected_fallback, int) and expected_fallback != fallback:
        raise ValueError(f"coverage says {expected_fallback} cold-start games but found {fallback}")
    return {
        "season": overview.get("season"),
        "upcoming_games": len(games),
        "primary_games": primary,
        "cold_start_games": fallback,
        "primary_context": primary_context,
        "checked_profiles": len({str(g.get("home_id")) for g in games if g.get("prediction")} | {str(g.get("away_id")) for g in games if g.get("prediction")}),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(json.dumps(check(args.root), indent=2))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"basketball game readiness failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
