"""Fit and publish the independent women’s 2026–27 forecast edition.

This model uses only source-native women’s team box scores. It is deliberately
separate from the men’s efficiency model: multi-season team net-margin ratings
are shrunk by sample size, a women’s probability scale is fit on training
games, and the latest completed season is held out for accuracy/calibration
checks before the target refit.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_basketball_sources import client

OUT = ROOT / "frontend/public/data/basketball/womens-forecast.json"
TRAINING_SEASONS = (2023, 2024, 2025)
VALIDATION_SEASON = 2026


def number(value):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def completed_games(rows):
    grouped = defaultdict(list)
    for row in rows:
        if number(row.get("team_score")) is None or number(row.get("opponent_team_score")) is None:
            continue
        game_id = str(row.get("game_id") or "")
        if game_id:
            grouped[game_id].append(row)
    return [rows for rows in grouped.values() if len(rows) >= 2]


def fit_team_ratings(rows, shrink_games=8.0):
    values = defaultdict(lambda: {"margin": 0.0, "points": 0.0, "allowed": 0.0, "games": 0, "name": ""})
    home_margins = []
    for game in completed_games(rows):
        for row in game:
            team_id = str(row.get("team_id") or "")
            if not team_id:
                continue
            score = number(row.get("team_score")) or 0.0
            allowed = number(row.get("opponent_team_score")) or 0.0
            item = values[team_id]
            item["margin"] += score - allowed
            item["points"] += score
            item["allowed"] += allowed
            item["games"] += 1
            item["name"] = row.get("team_display_name") or row.get("team_name") or team_id
            if str(row.get("team_home_away") or "").casefold() == "home":
                home_margins.append(score - allowed)
    home_advantage = sum(home_margins) / len(home_margins) if home_margins else 0.0
    ratings = {}
    for team_id, item in values.items():
        games = item["games"]
        weight = games / (games + shrink_games)
        ratings[team_id] = {
            "team_id": team_id,
            "team": item["name"],
            "rating": (item["margin"] / games) * weight,
            "points": item["points"] / games,
            "allowed": item["allowed"] / games,
            "games": games,
        }
    return ratings, home_advantage


def _sigmoid(value):
    value = max(-40.0, min(40.0, value))
    return 1.0 / (1.0 + math.exp(-value))


def fit_probability_calibration(rows, ratings, home_advantage):
    """Fit a women’s-only logistic scale on the training seasons."""
    examples = []
    for game in completed_games(rows):
        home = next((row for row in game if str(row.get("team_home_away") or "").casefold() == "home"), game[0])
        away = next((row for row in game if row is not home), game[1])
        if str(home.get("team_id")) not in ratings or str(away.get("team_id")) not in ratings:
            continue
        h = ratings[str(home.get("team_id"))]
        a = ratings[str(away.get("team_id"))]
        margin = h["rating"] - a["rating"] + home_advantage
        actual_margin = (number(home.get("team_score")) or 0.0) - (number(home.get("opponent_team_score")) or 0.0)
        examples.append((margin, 1 if actual_margin > 0 else 0))
    if not examples:
        return {"games": 0, "logistic_coefficients": [0.0, 1.0 / 9.0]}
    intercept, slope = 0.0, 1.0 / 9.0
    for _ in range(25):
        gradient_i = gradient_s = 0.0
        h_ii = h_is = h_ss = 0.0
        for margin, outcome in examples:
            probability = _sigmoid(intercept + slope * margin)
            residual = outcome - probability
            weight = max(1e-6, probability * (1.0 - probability))
            gradient_i += residual
            gradient_s += residual * margin
            h_ii += weight
            h_is += weight * margin
            h_ss += weight * margin * margin
        determinant = h_ii * h_ss - h_is * h_is
        if determinant <= 1e-9:
            break
        step_i = (gradient_i * h_ss - gradient_s * h_is) / determinant
        step_s = (gradient_s * h_ii - gradient_i * h_is) / determinant
        intercept += max(-1.0, min(1.0, step_i))
        slope = max(0.01, min(1.0, slope + max(-0.05, min(0.05, step_s))))
        if abs(step_i) < 1e-7 and abs(step_s) < 1e-7:
            break
    return {
        "games": len(examples),
        "logistic_coefficients": [round(intercept, 8), round(slope, 8)],
    }


def prediction(home, away, ratings, home_advantage, calibration=None):
    h = ratings.get(str(home))
    a = ratings.get(str(away))
    h_rating = h["rating"] if h else 0.0
    a_rating = a["rating"] if a else 0.0
    margin = h_rating - a_rating + home_advantage
    coefficients = (calibration or {}).get("logistic_coefficients") if calibration else None
    if isinstance(coefficients, list) and len(coefficients) == 2:
        probability = _sigmoid(float(coefficients[0]) + float(coefficients[1]) * margin)
    else:
        probability = _sigmoid(margin / 9.0)
    h_points = h["points"] if h else 68.0
    a_points = a["points"] if a else 68.0
    expected_total = (h_points + a_points) / 2.0
    return {
        "home_win_probability": round(probability, 4),
        "away_win_probability": round(1.0 - probability, 4),
        "predicted_margin": round(margin, 2),
        "predicted_home_score": round(expected_total / 2.0 + margin / 2.0, 1),
        "predicted_away_score": round(expected_total / 2.0 - margin / 2.0, 1),
        "estimate_type": "primary" if h and a and h["games"] >= 5 and a["games"] >= 5 else "cold_start",
        "home_training_games": h["games"] if h else 0,
        "away_training_games": a["games"] if a else 0,
    }


def evaluate(rows, ratings, home_advantage, calibration=None):
    absolute_errors = []
    brier = []
    log_loss = []
    correct = 0
    total = 0
    for game in completed_games(rows):
        home = next((row for row in game if str(row.get("team_home_away") or "").casefold() == "home"), game[0])
        away = next((row for row in game if row is not home), game[1])
        if str(home.get("team_id")) not in ratings or str(away.get("team_id")) not in ratings:
            continue
        forecast = prediction(home.get("team_id"), away.get("team_id"), ratings, home_advantage, calibration)
        actual_margin = (number(home.get("team_score")) or 0.0) - (number(home.get("opponent_team_score")) or 0.0)
        actual_home_win = 1 if actual_margin > 0 else 0
        p = forecast["home_win_probability"]
        absolute_errors.append(abs(forecast["predicted_margin"] - actual_margin))
        brier.append((p - actual_home_win) ** 2)
        log_loss.append(-(actual_home_win * math.log(max(p, 1e-9)) + (1 - actual_home_win) * math.log(max(1.0 - p, 1e-9))))
        correct += int((p >= 0.5) == bool(actual_home_win))
        total += 1
    return {
        "games": total,
        "margin_mae": round(sum(absolute_errors) / total, 4) if total else None,
        "win_accuracy": round(correct / total, 4) if total else None,
        "brier_score": round(sum(brier) / total, 4) if total else None,
        "log_loss": round(sum(log_loss) / total, 4) if total else None,
    }


def main():
    source = client()
    training_rows = []
    training_receipts = {}
    for season in TRAINING_SEASONS:
        rows, receipt = source.load("team_box", season)
        training_rows.extend(rows)
        training_receipts[season] = receipt
    validation_rows, validation_receipt = source.load("team_box", VALIDATION_SEASON)
    schedule, receipt_schedule = source.load("schedule", 2027)
    ratings_training, home_advantage = fit_team_ratings(training_rows)
    calibration = fit_probability_calibration(training_rows, ratings_training, home_advantage)
    validation = evaluate(validation_rows, ratings_training, home_advantage, calibration)
    if validation["games"] < 1000 or validation["brier_score"] is None:
        raise SystemExit("Women’s model validation did not have enough completed games")
    # Refit the published target edition on all completed history only after
    # the final season has been held out for the validation report above.
    ratings, final_home_advantage = fit_team_ratings(training_rows + validation_rows)
    forecasts = []
    for row in sorted(schedule, key=lambda value: value.get("date") or ""):
        if str(row.get("status_type_state") or "").casefold() != "pre":
            continue
        home_id, away_id = str(row.get("home_id") or ""), str(row.get("away_id") or "")
        if not home_id or not away_id:
            continue
        forecasts.append({
            "game_id": str(row.get("game_id") or row.get("id")),
            "date": row.get("date"),
            "home_id": home_id,
            "away_id": away_id,
            "home": row.get("home_display_name") or row.get("home_name"),
            "away": row.get("away_display_name") or row.get("away_name"),
            "prediction": prediction(home_id, away_id, ratings, final_home_advantage, calibration),
        })
    model_fingerprint = hashlib.sha256(json.dumps({**{str(season): receipt.get("sha256") for season, receipt in training_receipts.items()}, str(VALIDATION_SEASON): validation_receipt.get("sha256"), "schedule": receipt_schedule.get("sha256")}, sort_keys=True).encode()).hexdigest()[:12]
    edition = {
        "schema_version": 1,
        "model_id": f"womens-basketball-margin-v2-{model_fingerprint}",
        "sport": "basketball",
        "gender": "women",
        "target_season": 2027,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "model_status": "published",
        "method": "Multi-season shrunk team net-margin ratings with a source-native home-court estimate; the latest completed season is held out for validation before the target refit.",
        "training_seasons": list(TRAINING_SEASONS),
        "validation_season": VALIDATION_SEASON,
        "validation": validation,
        "calibration": {
            **calibration,
            "evaluated_season": VALIDATION_SEASON,
            "brier": validation["brier_score"],
            "log_loss": validation["log_loss"],
        },
        "home_advantage": round(final_home_advantage, 3),
        "coverage": {"forecast_rows": len(forecasts), "primary_rows": sum(item["prediction"]["estimate_type"] == "primary" for item in forecasts), "cold_start_rows": sum(item["prediction"]["estimate_type"] == "cold_start" for item in forecasts), "rated_teams": len(ratings)},
        "forecasts": forecasts,
        "receipts": {**{f"team_box_{season}": {"sha256": receipt.get("sha256"), "url": receipt.get("url")} for season, receipt in training_receipts.items()}, f"team_box_{VALIDATION_SEASON}": {"sha256": validation_receipt.get("sha256"), "url": validation_receipt.get("url")}, "schedule_2027": {"sha256": receipt_schedule.get("sha256"), "url": receipt_schedule.get("url")}},
        "limitations": ["This is a separate women’s model; men’s ratings and forecasts are never substituted.", "It uses team box-score history and does not incorporate a betting line or injury feed.", "Cold-start rows are explicitly labeled when either team has fewer than five training games."],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(edition, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(forecasts):,} forecasts; validation MAE {validation['margin_mae']})")


if __name__ == "__main__":
    main()
