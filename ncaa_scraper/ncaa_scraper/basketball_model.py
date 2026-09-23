"""Opponent-adjusted efficiency and tempo models with time-separated calibration."""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter

import numpy as np

VERSION = "basketball-efficiency-v2"
FT_POSSESSION_WEIGHT = 0.475
# Keep the production hyperparameters in one auditable record. These values
# were selected from chronological holdouts, rather than from the 2026–27
# forecast slate itself.
MODEL_SETTINGS = {
    "efficiency_penalty": 4.0,
    "tempo_penalty": 8.0,
    "season_weight": 0.5,
}


def ratio(numerator, denominator):
    return numerator / denominator if denominator > 0 else None


def home_venue_exposure(game):
    """Return the centered home-court exposure used by fitted ratings.

    A non-neutral game gives the listed home team half of the coefficient and
    the listed away team the opposite half. Neutral games carry no venue
    exposure. Keeping this in one helper prevents training and prediction from
    silently disagreeing about the neutral-site flag.
    """
    neutral = game.get("neutral")
    if isinstance(neutral, str):
        neutral = neutral.strip().casefold() in {"1", "true", "yes", "y"}
    return 0.0 if bool(neutral) else 0.5


def valid_count(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    )


def game_features(game, boxes):
    """Require two valid final box scores. Missing values are not imputed to zero."""
    if not game["completed"] or game["periods"] is None or game["periods"] < 2:
        return None
    sides = []
    for side in ["home", "away"]:
        box = boxes.get((game["id"], game[f"{side}_id"]))
        required = [
            "field_goals_attempted",
            "free_throws_attempted",
            "offensive_rebounds",
            "turnovers",
        ]
        if box is None or any(not valid_count(box.get(k)) for k in required):
            return None
        optional = {
            key: box.get(key)
            for key in (
                "field_goals_made",
                "three_point_field_goals_attempted",
                "three_point_field_goals_made",
            )
        }
        if any(value is not None and not valid_count(value) for value in optional.values()):
            return None
        fga = box.get("field_goals_attempted")
        fgm = optional["field_goals_made"]
        tpa = optional["three_point_field_goals_attempted"]
        tpm = optional["three_point_field_goals_made"]
        if (
            (fgm is not None and fgm > fga)
            or (tpa is not None and tpa > fga)
            or (tpm is not None and tpa is not None and tpm > tpa)
            or (tpm is not None and fgm is not None and tpm > fgm)
        ):
            return None
        if game[f"{side}_score"] is None:
            return None
        sides.append(
            box["field_goals_attempted"]
            + FT_POSSESSION_WEIGHT * box["free_throws_attempted"]
            - box["offensive_rebounds"]
            + box["turnovers"]
        )
    possessions = sum(sides) / 2
    minutes = 40 + max(0, game["periods"] - 2) * 5
    pace = possessions * 40 / minutes
    if not 35 <= pace <= 100:
        return None
    return {
        **game,
        "possessions": possessions,
        "pace": pace,
        "home_eff": 100 * game["home_score"] / possessions,
        "away_eff": 100 * game["away_score"] / possessions,
    }


def fit(games, *, teams=None):
    if len(games) < 100:
        raise ValueError("At least 100 paired completed games are required")
    latest = max(g["season"] for g in games)
    counts = Counter(
        t for g in games if g["season"] == latest for t in [g["home_id"], g["away_id"]]
    )
    # Keep a conservative prior for programs that do not meet the production
    # field threshold.  These priors are only used by the explicitly labeled
    # cold-start estimate; the trained coefficients below remain unchanged.
    prior_rows = Counter()
    prior_totals = {}
    for g in games:
        if g["season"] != latest:
            continue
        for own, opp, eff_key, opp_eff_key in [
            ("home", "away", "home_eff", "away_eff"),
            ("away", "home", "away_eff", "home_eff"),
        ]:
            tid = g[f"{own}_id"]
            row = prior_totals.setdefault(tid, [0.0, 0.0, 0.0])
            row[0] += float(g[eff_key])
            row[1] += float(g[opp_eff_key])
            row[2] += float(g["pace"])
            prior_rows[tid] += 1
    total_rows = sum(prior_rows.values())
    league = [
        sum(prior_totals[t][i] for t in prior_totals) / total_rows
        if total_rows
        else 0.0
        for i in range(3)
    ]
    # Rolling experiments freeze membership before the season begins. The
    # default production fit continues to infer its field from the latest year.
    teams = (
        sorted(t for t, n in counts.items() if n >= 10)
        if teams is None
        else sorted(set(teams))
    )
    games = [g for g in games if g["home_id"] in teams and g["away_id"] in teams]
    n = len(teams)
    if n < 2 or len(games) < 100:
        raise ValueError("Insufficient teams with ten observed games")
    index = {tid: i for i, tid in enumerate(teams)}
    x = np.zeros((2 * len(games), 2 + 2 * n))
    pace_x = np.zeros((len(games), n + 1))
    y, pace_y, weights = [], [], []
    for i, g in enumerate(games):
        h, a = index[g["home_id"]], index[g["away_id"]]
        venue = home_venue_exposure(g)
        for j, (own, opp, sign, eff) in enumerate(
            [(h, a, 1, g["home_eff"]), (a, h, -1, g["away_eff"])]
        ):
            x[2 * i + j, 0] = 1
            x[2 * i + j, 1] = venue * sign
            x[2 * i + j, 2 + own] = 1
            x[2 * i + j, 2 + n + opp] = 1
            y.append(eff)
        pace_x[i, 0] = 1
        pace_x[i, h + 1] = pace_x[i, a + 1] = 1
        pace_y.append(g["pace"])
        weights.append(MODEL_SETTINGS["season_weight"] ** (latest - g["season"]))

    def solve(features, target, w, penalty):
        regularizer = np.eye(features.shape[1]) * penalty
        regularizer[0, 0] = 0
        return np.linalg.solve(
            features.T @ (w[:, None] * features) + regularizer,
            features.T @ (w * np.asarray(target)),
        ).tolist()

    fallback_priors = {}
    for tid, row in prior_totals.items():
        n = prior_rows[tid]
        # Ten pseudo-games keeps one-game listings close to the league mean.
        reliability = n / (n + 10.0)
        fallback_priors[tid] = {
            "off": reliability * (row[0] / n - league[0]),
            "def": reliability * (row[1] / n - league[1]),
            "tempo": reliability * (row[2] / n - league[2]),
            "games": n,
        }
    return {
        "teams": teams,
        "efficiency": solve(
            x,
            y,
            np.repeat(weights, 2),
            MODEL_SETTINGS["efficiency_penalty"],
        ),
        "tempo": solve(
            pace_x,
            pace_y,
            np.asarray(weights),
            MODEL_SETTINGS["tempo_penalty"],
        ),
        "settings": dict(MODEL_SETTINGS),
        "training_games": len(games),
        "training_seasons": sorted({g["season"] for g in games}),
        "last_training_start": max(g["starts_at"] for g in games),
        "fallback_priors": fallback_priors,
    }


def raw_predict(model, game):
    if game["home_id"] not in model["teams"] or game["away_id"] not in model["teams"]:
        return None
    n = len(model["teams"])
    h, a = model["teams"].index(game["home_id"]), model["teams"].index(game["away_id"])
    b, tempo = model["efficiency"], model["tempo"]
    venue = home_venue_exposure(game) * b[1]
    pace = tempo[0] + tempo[h + 1] + tempo[a + 1]
    home = (b[0] + b[h + 2] + b[a + n + 2] + venue) * pace / 100
    away = (b[0] + b[a + 2] + b[h + n + 2] - venue) * pace / 100
    return {
        "home_score": home,
        "away_score": away,
        "home_margin": home - away,
        "total": home + away,
        "pace": pace,
    }


def fallback_raw_predict(model, game):
    """Predict with fitted effects plus shrunk latest-season priors.

    This is deliberately separate from :func:`raw_predict`: callers must opt
    into a cold-start estimate when a program is outside the trained field.
    """
    unknown = [
        tid
        for tid in (game["home_id"], game["away_id"])
        if tid not in model["teams"]
    ]
    if not unknown:
        return None
    n = len(model["teams"])
    b, tempo = model["efficiency"], model["tempo"]
    priors = model.get("fallback_priors", {})

    def effects(tid):
        if tid in model["teams"]:
            i = model["teams"].index(tid)
            return b[i + 2], b[i + n + 2], tempo[i + 1]
        prior = priors.get(tid, {})
        return prior.get("off", 0.0), prior.get("def", 0.0), prior.get("tempo", 0.0)

    hoff, hdef, htempo = effects(game["home_id"])
    aoff, adef, atempo = effects(game["away_id"])
    venue = home_venue_exposure(game) * b[1]
    pace = tempo[0] + htempo + atempo
    home = (b[0] + hoff + adef + venue) * pace / 100
    away = (b[0] + aoff + hdef - venue) * pace / 100
    return {
        "home_score": home,
        "away_score": away,
        "home_margin": home - away,
        "total": home + away,
        "pace": pace,
        "unknown_teams": unknown,
    }


def calibrate(games, model):
    pairs = [(g, raw_predict(model, g)) for g in games]
    pairs = [(g, p) for g, p in pairs if p is not None]
    return calibrate_predictions(pairs)


def calibrate_predictions(pairs):
    """Calibrate held-out raw predictions, including chronological rolling fits."""
    if len(pairs) < 100:
        raise ValueError("At least 100 independent calibration games required")
    x = np.asarray([[1, p["home_margin"]] for _, p in pairs])
    y = np.asarray([float(g["home_score"] > g["away_score"]) for g, _ in pairs])
    coef = np.array([0.0, 0.1])
    for _ in range(50):
        probabilities = 1 / (1 + np.exp(-np.clip(x @ coef, -30, 30)))
        hessian = (
            x.T @ ((probabilities * (1 - probabilities))[:, None] * x)
            + np.eye(2) * 0.01
        )
        step = np.linalg.solve(hessian, x.T @ (probabilities - y) + 0.01 * coef)
        coef -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    absolute_errors = [
        abs(p["home_margin"] - (g["home_score"] - g["away_score"])) for g, p in pairs
    ]
    absolute_total_errors = [
        abs(p["total"] - (g["home_score"] + g["away_score"])) for g, p in pairs
    ]
    return {
        "games": len(pairs),
        "season": min(g["season"] for g, _ in pairs),
        "logistic_coefficients": coef.tolist(),
        "margin_half_width": float(np.quantile(absolute_errors, 0.8)),
        "total_half_width": float(np.quantile(absolute_total_errors, 0.8)),
    }


def calibrate_fallback_width(games, model, default):
    """Estimate cold-start interval width from held-out games only."""
    errors = []
    for game in games:
        if raw_predict(model, game) is not None:
            continue
        predicted = fallback_raw_predict(model, game)
        if predicted is not None:
            errors.append(
                abs(predicted["home_margin"] - (game["home_score"] - game["away_score"]))
            )
    return (
        float(np.quantile(errors, 0.8)) if len(errors) >= 30 else float(default * 1.5),
        len(errors),
    )


def calibrate_fallback_total_width(games, model, default):
    """Estimate a cold-start total interval from held-out games only.

    A cold-start row has at least one program outside the trained field.  Its
    total therefore needs its own wider interval; reusing the primary range
    would imply precision that the model has not earned.
    """
    errors = []
    for game in games:
        if raw_predict(model, game) is not None:
            continue
        predicted = fallback_raw_predict(model, game)
        if predicted is not None:
            errors.append(
                abs(predicted["total"] - (game["home_score"] + game["away_score"]))
            )
    return (
        float(np.quantile(errors, 0.8)) if len(errors) >= 30 else float(default * 1.5),
        len(errors),
    )


def valid_total_interval(prediction):
    """Return whether a prediction carries a finite, symmetric total range."""
    values = [prediction.get(key) for key in ("total", "total_low", "total_high", "total_half_width")]
    return (
        all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in values)
        and values[3] > 0
        and values[1] <= values[0] <= values[2]
        and abs((values[0] - values[1]) - values[3]) <= 0.05
        and abs((values[2] - values[0]) - values[3]) <= 0.05
    )


def forecast(model, game):
    p = raw_predict(model, game)
    if p is None:
        return None
    return apply_calibration(p, model["calibration"])


def fallback_forecast(model, game):
    """Return an exploratory estimate for a game with an unmodeled program."""
    p = fallback_raw_predict(model, game)
    if p is None:
        return None
    result = apply_calibration(p, model["calibration"])
    width = model["calibration"].get(
        "fallback_margin_half_width",
        model["calibration"]["margin_half_width"] * 1.5,
    )
    result["margin_low"] = round(p["home_margin"] - width, 2)
    result["margin_high"] = round(p["home_margin"] + width, 2)
    total_width = model["calibration"].get(
        "fallback_total_half_width",
        model["calibration"].get("total_half_width", 0) * 1.5,
    )
    if total_width > 0:
        result["total_low"] = round(p["total"] - total_width, 2)
        result["total_high"] = round(p["total"] + total_width, 2)
        result["total_half_width"] = round(total_width, 2)
    result["estimate_type"] = "cold_start"
    result["unknown_teams"] = p["unknown_teams"]
    result["margin_half_width"] = round(width, 2)
    return result


def apply_calibration(p, calibration):
    intercept, slope = calibration["logistic_coefficients"]
    probability = 1 / (
        1 + math.exp(-max(-30, min(30, intercept + slope * p["home_margin"])))
    )
    # KenPom-style scoring rates implied by this same forecast and its
    # estimated possessions. These are model outputs, not observed stats.
    pace = p["pace"]
    home_efficiency = 100 * p["home_score"] / pace if pace > 0 else None
    away_efficiency = 100 * p["away_score"] / pace if pace > 0 else None
    numeric_keys = ("home_score", "away_score", "home_margin", "total", "pace")
    result = {
        **{k: round(p[k], 2) for k in numeric_keys},
        "home_win_probability": round(probability, 5),
        "margin_low": round(p["home_margin"] - calibration["margin_half_width"], 2),
        "margin_high": round(p["home_margin"] + calibration["margin_half_width"], 2),
    }
    # Totals are a separate forecast target.  A margin interval cannot be
    # reused for a total because the two errors have different variance and
    # correlation with pace.  Older editions may not carry this field, so
    # preserve their score forecast while withholding an unsupported range.
    total_width = calibration.get("total_half_width")
    if isinstance(total_width, (int, float)) and math.isfinite(total_width) and total_width > 0:
        result["total_low"] = round(p["total"] - total_width, 2)
        result["total_high"] = round(p["total"] + total_width, 2)
        result["total_half_width"] = round(total_width, 2)
    if home_efficiency is not None and away_efficiency is not None:
        result["home_efficiency"] = round(home_efficiency, 2)
        result["away_efficiency"] = round(away_efficiency, 2)
    return result


def train(games, cutoff, target_season=2027):
    valid = [
        g
        for g in games
        if g["completed"] and g["starts_at"] < cutoff and g["season"] < target_season
    ]
    calibration_year, test_year = target_season - 2, target_season - 1
    initial = fit([g for g in valid if g["season"] < calibration_year])
    calibration_games = [g for g in valid if g["season"] == calibration_year]
    calibration = calibrate(calibration_games, initial)
    fallback_width, fallback_games = calibrate_fallback_width(
        calibration_games, initial, calibration["margin_half_width"]
    )
    fallback_total_width, fallback_total_games = calibrate_fallback_total_width(
        calibration_games,
        initial,
        calibration.get("total_half_width", calibration["margin_half_width"]),
    )
    calibration["fallback_margin_half_width"] = fallback_width
    calibration["fallback_games"] = fallback_games
    calibration["fallback_total_half_width"] = fallback_total_width
    calibration["fallback_total_games"] = fallback_total_games
    evaluation_model = fit([g for g in valid if g["season"] < test_year])
    evaluation_model["calibration"] = calibration
    test = [g for g in valid if g["season"] == test_year]
    pairs = [(g, forecast(evaluation_model, g)) for g in test]
    scored = [(g, p) for g, p in pairs if p is not None]
    if not scored:
        raise ValueError("No independent evaluation games")
    errors = np.array(
        [p["home_margin"] - (g["home_score"] - g["away_score"]) for g, p in scored]
    )
    total_interval_rows = [
        (g, p)
        for g, p in scored
        if valid_total_interval(p)
    ]
    y = np.array([float(g["home_score"] > g["away_score"]) for g, _ in scored])
    probs = np.clip([p["home_win_probability"] for _, p in scored], 1e-6, 1 - 1e-6)
    baseline = np.mean(
        [g["home_score"] - g["away_score"] for g in valid if g["season"] < test_year]
    )
    model = fit(valid)
    model.update(
        {
            "version": VERSION,
            "cutoff": cutoff,
            "target_season": target_season,
            "calibration": calibration,
            "evaluation": {
                "season": test_year,
                "games": len(scored),
                "unscored_games": len(test) - len(scored),
                "margin_mae": float(np.abs(errors).mean()),
                "margin_rmse": float(np.sqrt((errors**2).mean())),
                "total_mae": float(
                    np.mean(
                        [
                            abs(p["total"] - g["home_score"] - g["away_score"])
                            for g, p in scored
                        ]
                    )
                ),
                "winner_accuracy": float(np.mean((probs >= 0.5) == y)),
                "brier": float(np.mean((probs - y) ** 2)),
                "log_loss": float(
                    -np.mean(y * np.log(probs) + (1 - y) * np.log(1 - probs))
                ),
                "interval_coverage": float(
                    np.mean(np.abs(errors) <= calibration["margin_half_width"])
                ),
                "total_interval_coverage": (
                    float(
                        np.mean(
                            [
                                p["total_low"] <= g["home_score"] + g["away_score"] <= p["total_high"]
                                for g, p in total_interval_rows
                            ]
                        )
                    )
                    if total_interval_rows
                    else None
                ),
                "total_interval_games": len(total_interval_rows),
                "baseline_margin_mae": float(
                    np.mean(
                        [
                            abs(baseline - g["home_score"] + g["away_score"])
                            for g, _ in scored
                        ]
                    )
                ),
                "training_seasons": evaluation_model["training_seasons"],
            },
            "limitations": [
                "Historical box-score strength, not an injury or roster-adjusted model.",
                "Schedules and 2026–27 rosters are partial source snapshots.",
                "Cold-start estimates use latest-season team priors shrunk toward the league mean; they are exploratory and carry a separately calibrated wider range.",
                "Estimated possessions use a 0.475 free-throw weight; pace is normalized to 40 minutes.",
                "Predictions use regulation pace; evaluation compares against final scores including overtime.",
                "Source corrections may have been published after games. This is a retrospective preseason test.",
            ],
        }
    )
    model["id"] = (
        VERSION
        + "-"
        + hashlib.sha256(json.dumps(model, sort_keys=True).encode()).hexdigest()[:12]
    )
    return model
