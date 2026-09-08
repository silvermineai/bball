"""Research-only football efficiency challenger.

The production football model remains the score-only ridge release. This
challenger uses lagged team advanced offense/defense rates from the retained
SportsDataverse team-game records to correct the published margin. It never
recalibrates the primary probability or interval and never writes a forecast
registration.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from .football_model import fit as fit_score_model
from .football_model import predict

VERSION = "football-efficiency-challenger-v1"
FEATURES = (
    "base_margin",
    "home_off_epa_minus_away_off_epa",
    "home_def_epa_minus_away_def_epa",
    "home_off_ypp_minus_away_off_ypp",
    "home_def_ypp_minus_away_def_ypp",
)
FEATURE_SEASONS = 3
PRIOR_WEIGHT = 0.5
SHRINKAGE_PLAYS = 300.0
RIDGE_PENALTY = 100.0


def _number(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if np.isfinite(value) else None


def _advanced_rows(conn: sqlite3.Connection):
    result = {}
    for row in conn.execute(
        "SELECT season,game_id,team_id,stats_json FROM football_stats WHERE dataset='team_advanced'"
    ):
        payload = json.loads(row[3])
        team_id = payload.get("pos_team_id") or row[2]
        epa = _number(payload.get("EPA_overall_off"))
        yards = _number(payload.get("off_yards"))
        plays = _number(payload.get("scrimmage_plays"))
        if not row[1] or not team_id or epa is None or yards is None or plays is None or plays <= 0:
            continue
        result[(str(row[1]), str(team_id))] = {
            "season": int(row[0]),
            "epa": epa,
            "yards": yards,
            "plays": plays,
        }
    return result


def _fbs_game(game):
    return (
        game.get("completed")
        and game.get("home_score") is not None
        and game.get("away_score") is not None
        and game.get("home_division") == "fbs"
        and game.get("away_division") == "fbs"
    )


def _feature_state(games, advanced, target_season):
    teams = defaultdict(lambda: {"off_epa": 0.0, "off_yards": 0.0, "off_plays": 0.0, "def_epa": 0.0, "def_yards": 0.0, "def_plays": 0.0})
    league = {"epa": 0.0, "yards": 0.0, "plays": 0.0}
    selected = []
    for game in games:
        if not _fbs_game(game) or not (target_season - FEATURE_SEASONS <= game["season"] < target_season):
            continue
        home = advanced.get((game["id"], str(game["home_id"])))
        away = advanced.get((game["id"], str(game["away_id"])))
        if not home or not away:
            continue
        weight = PRIOR_WEIGHT ** (target_season - 1 - game["season"])
        selected.append(game["id"])
        for side, other in (("home", "away"), ("away", "home")):
            own = home if side == "home" else away
            opp = away if side == "home" else home
            team = teams[str(game[side + "_id"])]
            team["off_epa"] += weight * own["epa"]
            team["off_yards"] += weight * own["yards"]
            team["off_plays"] += weight * own["plays"]
            team["def_epa"] += weight * opp["epa"]
            team["def_yards"] += weight * opp["yards"]
            team["def_plays"] += weight * opp["plays"]
            league["epa"] += weight * own["epa"]
            league["yards"] += weight * own["yards"]
            league["plays"] += weight * own["plays"]
    if not selected or league["plays"] <= 0:
        return None
    prior = {
        "epa": league["epa"] / league["plays"],
        "ypp": league["yards"] / league["plays"],
    }
    rates = {}
    for team_id, totals in teams.items():
        rates[team_id] = {
            "off_epa": (totals["off_epa"] + SHRINKAGE_PLAYS * prior["epa"]) / (totals["off_plays"] + SHRINKAGE_PLAYS),
            "off_ypp": (totals["off_yards"] + SHRINKAGE_PLAYS * prior["ypp"]) / (totals["off_plays"] + SHRINKAGE_PLAYS),
            "def_epa": (totals["def_epa"] + SHRINKAGE_PLAYS * prior["epa"]) / (totals["def_plays"] + SHRINKAGE_PLAYS),
            "def_ypp": (totals["def_yards"] + SHRINKAGE_PLAYS * prior["ypp"]) / (totals["def_plays"] + SHRINKAGE_PLAYS),
        }
    return {"prior": prior, "rates": rates, "games": selected}


def _feature_vector(game, state, base_margin):
    default = {
        "off_epa": state["prior"]["epa"],
        "def_epa": state["prior"]["epa"],
        "off_ypp": state["prior"]["ypp"],
        "def_ypp": state["prior"]["ypp"],
    }
    home = state["rates"].get(str(game["home_id"]), default)
    away = state["rates"].get(str(game["away_id"]), default)
    return [
        base_margin,
        home["off_epa"] - away["off_epa"],
        home["def_epa"] - away["def_epa"],
        home["off_ypp"] - away["off_ypp"],
        home["def_ypp"] - away["def_ypp"],
    ]


def _rows(games, advanced, target_season):
    prior_games = [g for g in games if _fbs_game(g) and g["season"] < target_season]
    if len(prior_games) < 100:
        return [], None
    base_model = fit_score_model(prior_games)
    state = _feature_state(games, advanced, target_season)
    if state is None:
        return [], None
    result = []
    for game in games:
        if game["season"] != target_season or not _fbs_game(game):
            continue
        base = predict(base_model, game)
        if base is None:
            continue
        result.append(
            {
                "game": game,
                "features": _feature_vector(game, state, base[0]),
                "base_margin": base[0],
                "actual_margin": game["home_score"] - game["away_score"],
            }
        )
    return result, state


def _fit(rows):
    if len(rows) < 100:
        return None
    x = np.asarray([row["features"] for row in rows], dtype=float)
    y = np.asarray([row["actual_margin"] - row["base_margin"] for row in rows], dtype=float)
    mean = x.mean(axis=0)
    scale = x.std(axis=0)
    scale[scale < 1e-12] = 1.0
    design = np.column_stack((np.ones(len(x)), (x - mean) / scale))
    penalty = np.eye(design.shape[1]) * RIDGE_PENALTY
    penalty[0, 0] = 0
    coefficients = np.linalg.solve(design.T @ design + penalty, design.T @ y)
    return {"features": list(FEATURES), "mean": mean.tolist(), "scale": scale.tolist(), "coefficients": coefficients.tolist(), "rows": len(rows)}


def _correct(row, model):
    x = np.asarray(row["features"], dtype=float)
    correction = model["coefficients"][0] + float(np.sum(((x - model["mean"]) / model["scale"]) * model["coefficients"][1:]))
    return row["base_margin"] + correction


def _metrics(rows, model):
    errors = np.asarray([_correct(row, model) - row["actual_margin"] for row in rows])
    base = np.asarray([row["base_margin"] - row["actual_margin"] for row in rows])
    return {
        "rows": len(rows),
        "baseline_mae": float(np.mean(np.abs(base))),
        "challenger_mae": float(np.mean(np.abs(errors))),
        "improvement_vs_primary": float(np.mean(np.abs(base)) - np.mean(np.abs(errors))),
        "baseline_rmse": float(np.sqrt(np.mean(base**2))),
        "challenger_rmse": float(np.sqrt(np.mean(errors**2))),
    }


def build(conn, games, primary_model, upcoming, target_season=2026):
    advanced = _advanced_rows(conn)
    transitions = {}
    for season in range(target_season - 3, target_season):
        rows, state = _rows(games, advanced, season)
        transitions[season] = rows
    training = [row for season, rows in transitions.items() if season < target_season - 1 for row in rows]
    holdout = transitions.get(target_season - 1, [])
    holdout_model = _fit(training)
    production_rows = [row for rows in transitions.values() for row in rows]
    production_model = _fit(production_rows)
    evaluation = _metrics(holdout, holdout_model) if holdout_model and holdout else {"rows": 0, "baseline_mae": None, "challenger_mae": None, "improvement_vs_primary": None, "baseline_rmse": None, "challenger_rmse": None}
    current_state = _feature_state(games, advanced, target_season)
    scenarios = []
    if current_state and production_model:
        for game in upcoming:
            if (
                not game.get("prediction")
                or game.get("home_division") != "fbs"
                or game.get("away_division") != "fbs"
            ):
                continue
            base = predict(primary_model, game)
            if base is None:
                continue
            row = {"game": game, "base_margin": base[0], "features": _feature_vector(game, current_state, base[0])}
            challenger = _correct(row, production_model)
            scenarios.append({"game_id": game["id"], "base_margin": round(base[0], 2), "challenger_margin": round(challenger, 2), "margin_delta": round(challenger - base[0], 2)})
    payload = {
        "version": VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "target_season": target_season,
        "feature_definition": "Lagged three-season team advanced offense/defense EPA per play and yards per play, shrunk toward the prior league mean; residual correction on the published score-only margin.",
        "model": production_model,
        "evaluation": evaluation,
        "coverage": {"advanced_rows": len(advanced), "training_rows": len(production_rows), "holdout_rows": len(holdout), "current_scenarios": len(scenarios), "current_teams": len(current_state["rates"]) if current_state else 0},
        "limitations": ["Research-only challenger; primary football probabilities, intervals and ledger registrations are unchanged.", "Advanced source coverage is incomplete for 2026 and unknown teams shrink to the prior league mean.", "No injuries, transfers, depth charts, weather or coaching features are included.", "The held-out transition is one season and is not evidence of future market advantage."],
        "scenarios": scenarios,
    }
    payload["id"] = VERSION + "-" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:12]
    return payload
