"""Reproducible ridge score models with a strictly separate season holdout."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime

import numpy as np

MODEL_VERSION = "ridge-team-v1"


def eligible(game: dict, cutoff: str) -> bool:
    return bool(
        game["completed"]
        and game["home_score"] is not None
        and game["away_score"] is not None
        and datetime.fromisoformat(game["kickoff"].replace("Z", "+00:00"))
        < datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
        and game["home_division"] == "fbs"
        and game["away_division"] == "fbs"
    )


def fit(games: list[dict]) -> dict:
    if len(games) < 100:
        raise ValueError("At least 100 completed FBS matchups required")
    teams = sorted({g[k] for g in games for k in ("home_id", "away_id")})
    index = {t: i + 2 for i, t in enumerate(teams)}
    margin_x = np.zeros((len(games), len(teams) + 2))
    total_x = margin_x.copy()
    margin_y, total_y, weights = [], [], []
    last_season = max(g["season"] for g in games)
    for i, g in enumerate(games):
        margin_x[i, 0] = total_x[i, 0] = 1
        margin_x[i, 1] = total_x[i, 1] = 0 if g["neutral"] else 1
        margin_x[i, index[g["home_id"]]] = 1
        margin_x[i, index[g["away_id"]]] = -1
        total_x[i, index[g["home_id"]]] = total_x[i, index[g["away_id"]]] = 1
        margin_y.append(g["home_score"] - g["away_score"])
        total_y.append(g["home_score"] + g["away_score"])
        weights.append(0.65 ** (last_season - g["season"]))
    w = np.asarray(weights)

    def solve(x, y, penalty):
        regularizer = np.eye(x.shape[1]) * penalty
        regularizer[0, 0] = 0
        regularizer[1, 1] = 2
        return np.linalg.solve(
            x.T @ (w[:, None] * x) + regularizer, x.T @ (w * y)
        ).tolist()

    return {
        "teams": teams,
        "margin_coef": solve(margin_x, np.asarray(margin_y), 12),
        "total_coef": solve(total_x, np.asarray(total_y), 24),
        "training_games": len(games),
        "training_seasons": sorted({g["season"] for g in games}),
        "latest_training_kickoff": max(g["kickoff"] for g in games),
    }


def predict(model: dict, game: dict) -> tuple[float, float] | None:
    if game["home_id"] not in model["teams"] or game["away_id"] not in model["teams"]:
        return None
    home = model["teams"].index(game["home_id"]) + 2
    away = model["teams"].index(game["away_id"]) + 2
    m, t = model["margin_coef"], model["total_coef"]
    venue = 0 if game["neutral"] else 1
    return m[0] + venue * m[1] + m[home] - m[away], t[0] + venue * t[1] + t[home] + t[
        away
    ]


def train_and_evaluate(
    games: list[dict], cutoff: str, target_season: int = 2026
) -> dict:
    completed = [
        g for g in games if eligible(g, cutoff) and g["season"] <= target_season
    ]
    holdout_season = target_season - 1
    historical = [g for g in completed if g["season"] < holdout_season]
    test = [g for g in completed if g["season"] == holdout_season]
    evaluation_model = fit(historical)
    scored = [(g, predict(evaluation_model, g)) for g in test]
    scored = [(g, p) for g, p in scored if p is not None]
    if not scored:
        raise ValueError("No independent holdout games available")
    errors = np.asarray([p[0] - (g["home_score"] - g["away_score"]) for g, p in scored])
    total_errors = np.asarray(
        [p[1] - (g["home_score"] + g["away_score"]) for g, p in scored]
    )
    baseline_margin = float(
        np.mean([g["home_score"] - g["away_score"] for g in historical])
    )
    baseline_errors = [
        baseline_margin - (g["home_score"] - g["away_score"]) for g, _ in scored
    ]
    model = fit(completed)
    sigma = float(np.sqrt(np.mean(errors**2)))
    model.update(
        {
            "version": MODEL_VERSION,
            "cutoff": cutoff,
            "target_season": target_season,
            "sigma": sigma,
            "evaluation": {
                "season": holdout_season,
                "games": len(scored),
                "unscored_games": len(test) - len(scored),
                "training_seasons": evaluation_model["training_seasons"],
                "margin_mae": float(np.mean(np.abs(errors))),
                "margin_rmse": sigma,
                "total_mae": float(np.mean(np.abs(total_errors))),
                "baseline_margin_mae": float(np.mean(np.abs(baseline_errors))),
                "winner_accuracy": sum(
                    (p[0] > 0) == (g["home_score"] > g["away_score"]) for g, p in scored
                )
                / len(scored),
                "design": "Fixed preseason holdout; no holdout games used to fit coefficients. Hyperparameters fixed in code; not tuned on holdout.",
                "probability_note": "Normal-error probabilities use holdout RMSE; not independently calibrated or probability-backtested.",
            },
            "limitations": [
                "No injuries, depth charts, recruiting or transfers in model features.",
                "Team identity, home field and historical scores only; preseason roster changes can be material.",
                "Unseen teams and non-FBS opponents receive no prediction.",
                "80% margin ranges assume normal errors; not coverage-calibrated.",
                "Historical results may include source corrections published after games.",
            ],
        }
    )
    model["id"] = (
        MODEL_VERSION
        + "-"
        + hashlib.sha256(json.dumps(model, sort_keys=True).encode()).hexdigest()[:12]
    )
    return model


def forecast(model: dict, game: dict) -> dict | None:
    result = predict(model, game)
    if result is None:
        return None
    margin, total = result
    probability = 0.5 * (1 + math.erf(margin / (model["sigma"] * math.sqrt(2))))
    return {
        "home_margin": round(margin, 2),
        "total": round(total, 2),
        "home_score": round((total + margin) / 2, 1),
        "away_score": round((total - margin) / 2, 1),
        "home_win_probability": round(probability, 4),
        "margin_low": round(margin - 1.281552 * model["sigma"], 1),
        "margin_high": round(margin + 1.281552 * model["sigma"], 1),
    }
