"""Reproducible ridge score models with a strictly separate season holdout."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime

import numpy as np

MODEL_VERSION = "ridge-team-calibrated-v2"


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


def calibrate(games: list[dict], model: dict) -> dict:
    pairs = [(g, predict(model, g)) for g in games]
    pairs = [(g, p) for g, p in pairs if p is not None]
    binary = [(g, p) for g, p in pairs if g["home_score"] != g["away_score"]]
    if len(binary) < 100:
        raise ValueError("At least 100 separate binary calibration games required")
    x = np.array([[1.0, p[0]] for _, p in binary])
    y = np.array([float(g["home_score"] > g["away_score"]) for g, _ in binary])
    if len(set(y)) != 2:
        raise ValueError("Calibration needs both home and away wins")
    coef = np.array([0.0, 0.1])
    for _ in range(100):
        probability = 1 / (1 + np.exp(-np.clip(x @ coef, -30, 30)))
        gradient = x.T @ (probability - y) + 0.01 * coef
        hessian = (
            x.T @ ((probability * (1 - probability))[:, None] * x) + np.eye(2) * 0.01
        )
        step = np.linalg.solve(hessian, gradient)
        coef -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    else:
        raise ValueError("Probability calibration did not converge")
    if not np.all(np.isfinite(coef)) or coef[1] <= 0:
        raise ValueError("Calibration must increase with projected home margin")
    errors = [abs(p[0] - g["home_score"] + g["away_score"]) for g, p in pairs]
    return {
        "season": min(g["season"] for g, _ in pairs),
        "games": len(pairs),
        "binary_games": len(binary),
        "unscored_games": len(games) - len(pairs),
        "logistic_coefficients": coef.tolist(),
        "logistic_penalty": 0.01,
        "margin_half_width": float(np.quantile(errors, 0.8)),
        "training_seasons": model["training_seasons"],
        "latest_training_kickoff": model["latest_training_kickoff"],
        "latest_calibration_kickoff": max(g["kickoff"] for g, _ in pairs),
    }


def train_and_evaluate(
    games: list[dict],
    cutoff: str,
    target_season: int = 2026,
    *,
    validation_out: dict | None = None,
) -> dict:
    completed = [
        g for g in games if eligible(g, cutoff) and g["season"] <= target_season
    ]
    holdout_season = target_season - 1
    calibration_season = target_season - 2
    initial = fit([g for g in completed if g["season"] < calibration_season])
    calibration_games = [g for g in completed if g["season"] == calibration_season]
    calibration = calibrate(calibration_games, initial)
    historical = [g for g in completed if g["season"] < holdout_season]
    test = [g for g in completed if g["season"] == holdout_season]
    evaluation_model = fit(historical)
    evaluation_model["calibration"] = calibration
    scored = [(g, predict(evaluation_model, g)) for g in test]
    scored = [(g, p) for g, p in scored if p is not None]
    if not scored:
        raise ValueError("No independent holdout games available")
    errors = np.asarray([p[0] - (g["home_score"] - g["away_score"]) for g, p in scored])
    total_errors = np.asarray(
        [p[1] - (g["home_score"] + g["away_score"]) for g, p in scored]
    )
    predicted = [(g, forecast(evaluation_model, g)) for g, _ in scored]
    binary = [(g, p) for g, p in predicted if g["home_score"] != g["away_score"]]
    if not binary:
        raise ValueError("No binary outcomes in the independent holdout")
    y = np.array([float(g["home_score"] > g["away_score"]) for g, _ in binary])
    probabilities = np.clip(
        [p["home_win_probability"] for _, p in binary], 1e-6, 1 - 1e-6
    )
    bins = []
    for index in range(10):
        sample = [
            (g, p)
            for g, p in binary
            if min(9, int(p["home_win_probability"] * 10)) == index
        ]
        bins.append(
            {
                "lower": index / 10,
                "upper": (index + 1) / 10,
                "games": len(sample),
                "predicted": float(
                    np.mean([p["home_win_probability"] for _, p in sample])
                )
                if sample
                else None,
                "observed": float(
                    np.mean([g["home_score"] > g["away_score"] for g, _ in sample])
                )
                if sample
                else None,
            }
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
            "calibration": calibration,
            "evaluation": {
                "season": holdout_season,
                "games": len(scored),
                "unscored_games": len(test) - len(scored),
                "training_seasons": evaluation_model["training_seasons"],
                "margin_mae": float(np.mean(np.abs(errors))),
                "margin_rmse": sigma,
                "total_mae": float(np.mean(np.abs(total_errors))),
                "baseline_margin_mae": float(np.mean(np.abs(baseline_errors))),
                "binary_games": len(binary),
                "winner_accuracy": float(np.mean((probabilities >= 0.5) == y)),
                "margin_pick_accuracy": sum(
                    (p[0] > 0) == (g["home_score"] > g["away_score"]) for g, p in scored
                )
                / len(scored),
                "brier": float(np.mean((probabilities - y) ** 2)),
                "log_loss": float(
                    -np.mean(
                        y * np.log(probabilities) + (1 - y) * np.log(1 - probabilities)
                    )
                ),
                "interval_coverage": float(
                    np.mean(
                        [
                            p["margin_low"]
                            <= g["home_score"] - g["away_score"]
                            <= p["margin_high"]
                            for g, p in predicted
                        ]
                    )
                ),
                "reliability": bins,
                "design": "Fixed preseason holdout; no holdout games used to fit coefficients. Hyperparameters fixed in code; not tuned on holdout.",
                "probability_note": "Logistic probabilities and empirical 80% ranges are calibrated on the preceding season, then evaluated on this separate holdout. Ties are excluded from binary metrics.",
            },
            "limitations": [
                "No injuries, depth charts, recruiting or transfers in model features.",
                "Team identity, home field and historical scores only; preseason roster changes can be material.",
                "Unseen teams and non-FBS opponents receive no prediction.",
                "A prior-season 80th-percentile absolute error sets the symmetric margin range; its nominal level is not a future guarantee.",
                "Calibration and fixed preseason evaluation are retrospective; production may include completed current-season games.",
                "Historical results may include source corrections published after games.",
            ],
        }
    )
    model["id"] = (
        MODEL_VERSION
        + "-"
        + hashlib.sha256(json.dumps(model, sort_keys=True).encode()).hexdigest()[:12]
    )
    if validation_out is not None:
        validation_out.update(
            {
                "model_id": model["id"],
                "initial_model": initial,
                "evaluation_model": evaluation_model,
                "initial_training_ids": sorted(
                    g["id"] for g in completed if g["season"] < calibration_season
                ),
                "evaluation_training_ids": sorted(g["id"] for g in historical),
                "calibration_predictions": [
                    {
                        "game": {k: v for k, v in g.items() if k != "source_json"},
                        "raw_margin": p[0],
                        "raw_total": p[1],
                    }
                    for g in calibration_games
                    if (p := predict(initial, g)) is not None
                ],
                "evaluation_predictions": [
                    {
                        "game": {k: v for k, v in g.items() if k != "source_json"},
                        "prediction": p,
                        "raw_margin": raw[0],
                        "raw_total": raw[1],
                    }
                    for (g, p), (_, raw) in zip(predicted, scored)
                ],
                "excluded_calibration_ids": sorted(
                    g["id"] for g in calibration_games if predict(initial, g) is None
                ),
                "excluded_evaluation_ids": sorted(
                    g["id"] for g in test if predict(evaluation_model, g) is None
                ),
            }
        )
    return model


def forecast(model: dict, game: dict) -> dict | None:
    result = predict(model, game)
    if result is None:
        return None
    margin, total = result
    if "calibration" in model:
        intercept, slope = model["calibration"]["logistic_coefficients"]
        probability = 1 / (1 + math.exp(-max(-30, min(30, intercept + slope * margin))))
        width = model["calibration"]["margin_half_width"]
    else:
        # Retained v1 model artifacts must still reproduce their original forecasts.
        probability = 0.5 * (1 + math.erf(margin / (model["sigma"] * math.sqrt(2))))
        width = 1.281552 * model["sigma"]
    return {
        "home_margin": round(margin, 2),
        "total": round(total, 2),
        "home_score": round((total + margin) / 2, 1),
        "away_score": round((total - margin) / 2, 1),
        "home_win_probability": round(probability, 4),
        "margin_low": round(margin - width, 1),
        "margin_high": round(margin + width, 1),
    }
