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
MODEL_VERSION = "womens-basketball-opponent-adjusted-v4"


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


def fit_team_ratings(rows, shrink_games=8.0, iterations=40):
    """Fit schedule-adjusted scoring units on a neutral-court basis.

    Each team's offense is adjusted for the defenses it faced and each defense
    for the offenses it faced.  The alternating updates are shrunk toward the
    observed scoring environment, which keeps sparse teams from acquiring an
    extreme rating.  Home court is estimated from the residual after team
    strength rather than from raw home margins alone.
    """
    values = defaultdict(lambda: {"margin": 0.0, "points": 0.0, "allowed": 0.0, "games": 0, "name": ""})
    observations = []
    for game in completed_games(rows):
        for row in game:
            team_id = str(row.get("team_id") or "")
            if not team_id:
                continue
            opponent = next((candidate for candidate in game if str(candidate.get("team_id") or "") != team_id), None)
            opponent_id = str((opponent or {}).get("team_id") or "")
            if not opponent_id:
                continue
            score = number(row.get("team_score")) or 0.0
            allowed = number(row.get("opponent_team_score")) or 0.0
            location = str(row.get("team_home_away") or "").casefold()
            item = values[team_id]
            item["margin"] += score - allowed
            item["points"] += score
            item["allowed"] += allowed
            item["games"] += 1
            item["name"] = row.get("team_display_name") or row.get("team_name") or team_id
            observations.append({
                "team_id": team_id,
                "opponent_id": opponent_id,
                "score": score,
                "allowed": allowed,
                "location": location,
            })
    if not observations:
        return {}, 0.0

    league_average = sum(item["score"] for item in observations) / len(observations)
    offense = {team_id: league_average for team_id in values}
    defense = {team_id: league_average for team_id in values}
    home_advantage = 3.0
    for _ in range(max(1, iterations)):
        offense_samples = defaultdict(list)
        defense_samples = defaultdict(list)
        for item in observations:
            venue_half = home_advantage / 2.0 if item["location"] == "home" else -home_advantage / 2.0 if item["location"] == "away" else 0.0
            neutral_score = item["score"] - venue_half
            neutral_allowed = item["allowed"] + venue_half
            opponent_id = item["opponent_id"]
            offense_samples[item["team_id"]].append(neutral_score - defense.get(opponent_id, league_average) + league_average)
            defense_samples[item["team_id"]].append(neutral_allowed - offense.get(opponent_id, league_average) + league_average)

        next_offense = {}
        next_defense = {}
        for team_id, item in values.items():
            games = item["games"]
            weight = games / (games + shrink_games)
            raw_offense = sum(offense_samples[team_id]) / len(offense_samples[team_id])
            raw_defense = sum(defense_samples[team_id]) / len(defense_samples[team_id])
            next_offense[team_id] = league_average + weight * (raw_offense - league_average)
            next_defense[team_id] = league_average + weight * (raw_defense - league_average)

        # Center both units so their weighted means remain tied to the actual
        # scoring environment rather than drifting during alternating updates.
        total_games = sum(item["games"] for item in values.values())
        offense_center = sum(next_offense[team_id] * values[team_id]["games"] for team_id in values) / total_games
        defense_center = sum(next_defense[team_id] * values[team_id]["games"] for team_id in values) / total_games
        next_offense = {team_id: value - offense_center + league_average for team_id, value in next_offense.items()}
        next_defense = {team_id: value - defense_center + league_average for team_id, value in next_defense.items()}

        home_residuals = []
        for item in observations:
            if item["location"] != "home":
                continue
            team_rating = next_offense[item["team_id"]] - next_defense[item["team_id"]]
            opponent_rating = next_offense.get(item["opponent_id"], league_average) - next_defense.get(item["opponent_id"], league_average)
            home_residuals.append(item["score"] - item["allowed"] - (team_rating - opponent_rating))
        next_home_advantage = sum(home_residuals) / len(home_residuals) if home_residuals else 0.0
        next_home_advantage = max(-10.0, min(10.0, next_home_advantage))
        delta = max(
            abs(next_offense[team_id] - offense[team_id]) for team_id in values
        )
        delta = max(delta, max(abs(next_defense[team_id] - defense[team_id]) for team_id in values), abs(next_home_advantage - home_advantage))
        offense, defense = next_offense, next_defense
        home_advantage = 0.5 * home_advantage + 0.5 * next_home_advantage
        if delta < 1e-7:
            break

    ratings = {}
    for team_id, item in values.items():
        ratings[team_id] = {
            "team_id": team_id,
            "team": item["name"],
            "rating": offense[team_id] - defense[team_id],
            "adjusted_offense": offense[team_id],
            "adjusted_defense": defense[team_id],
            "league_average": league_average,
            "points": item["points"] / item["games"],
            "allowed": item["allowed"] / item["games"],
            "games": item["games"],
        }
    return ratings, home_advantage


def _sigmoid(value):
    value = max(-40.0, min(40.0, value))
    return 1.0 / (1.0 + math.exp(-value))


def empirical_quantile(values, quantile):
    """Return a deterministic nearest-rank quantile for finite values."""
    ordered = sorted(value for value in values if math.isfinite(value))
    if not ordered:
        return None
    probability = max(0.0, min(1.0, float(quantile)))
    index = min(len(ordered) - 1, max(0, math.ceil(probability * len(ordered)) - 1))
    return ordered[index]


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


def fit_margin_interval(rows, ratings, home_advantage, calibration, target=0.8):
    """Estimate a nominal margin interval from training residuals only.

    The interval is carried into the publication so every forecast has an
    explicit uncertainty width. Validation coverage is reported separately on
    the held-out season; this function never uses future games.
    """
    errors = []
    for game in completed_games(rows):
        home = next((row for row in game if str(row.get("team_home_away") or "").casefold() == "home"), game[0])
        away = next((row for row in game if row is not home), game[1])
        home_id, away_id = str(home.get("team_id") or ""), str(away.get("team_id") or "")
        if home_id not in ratings or away_id not in ratings:
            continue
        forecast = prediction(home_id, away_id, ratings, home_advantage, calibration)
        actual = (number(home.get("team_score")) or 0.0) - (number(home.get("opponent_team_score")) or 0.0)
        errors.append(abs(forecast["predicted_margin"] - actual))
    width = empirical_quantile(errors, target)
    return {
        "margin_half_width": round(max(width or 0.5, 0.5), 4),
        "interval_games": len(errors),
        "interval_target": target,
    }


def prediction(home, away, ratings, home_advantage, calibration=None):
    h = ratings.get(str(home))
    a = ratings.get(str(away))
    h_rating = h["rating"] if h else 0.0
    a_rating = a["rating"] if a else 0.0
    league_average = (h or a or {}).get("league_average", 68.0)
    home_offense = h["adjusted_offense"] if h else league_average
    home_defense = h["adjusted_defense"] if h else league_average
    away_offense = a["adjusted_offense"] if a else league_average
    away_defense = a["adjusted_defense"] if a else league_average
    home_score = home_offense + away_defense - league_average + home_advantage / 2.0
    away_score = away_offense + home_defense - league_average - home_advantage / 2.0
    margin = home_score - away_score
    coefficients = (calibration or {}).get("logistic_coefficients") if calibration else None
    if isinstance(coefficients, list) and len(coefficients) == 2:
        probability = _sigmoid(float(coefficients[0]) + float(coefficients[1]) * margin)
    else:
        probability = _sigmoid(margin / 9.0)
    result = {
        "home_win_probability": round(probability, 4),
        "away_win_probability": round(1.0 - probability, 4),
        "predicted_margin": round(margin, 2),
        "predicted_home_score": round(home_score, 1),
        "predicted_away_score": round(away_score, 1),
        "estimate_type": "primary" if h and a and h["games"] >= 5 and a["games"] >= 5 else "cold_start",
        "home_training_games": h["games"] if h else 0,
        "away_training_games": a["games"] if a else 0,
        "model_inputs": {
            "home_adjusted_offense": round(home_offense, 2),
            "home_adjusted_defense": round(home_defense, 2),
            "away_adjusted_offense": round(away_offense, 2),
            "away_adjusted_defense": round(away_defense, 2),
            "home_adjusted_net": round(h_rating, 2),
            "away_adjusted_net": round(a_rating, 2),
            "neutral_court_edge": round(h_rating - a_rating, 2),
            "home_court_adjustment": round(home_advantage, 2),
            "league_average_points": round(league_average, 2),
        },
    }
    width = number((calibration or {}).get("margin_half_width"))
    if width is not None and width > 0:
        result["margin_low"] = round(margin - width, 2)
        result["margin_high"] = round(margin + width, 2)
    return result


def evaluate(rows, ratings, home_advantage, calibration=None):
    absolute_errors = []
    brier = []
    log_loss = []
    correct = 0
    total = 0
    interval_hits = 0
    interval_games = 0
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
        if forecast.get("margin_low") is not None and forecast.get("margin_high") is not None:
            interval_games += 1
            interval_hits += int(forecast["margin_low"] <= actual_margin <= forecast["margin_high"])
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
        "interval_games": interval_games,
        "interval_coverage": round(interval_hits / interval_games, 4) if interval_games else None,
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
    calibration.update(fit_margin_interval(training_rows, ratings_training, home_advantage, calibration))
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
    team_ratings = []
    for rank, row in enumerate(sorted(ratings.values(), key=lambda value: (-value["rating"], value["team"], value["team_id"])), start=1):
        team_ratings.append({**row, "rank": rank, "rating": round(row["rating"], 2), "adjusted_offense": round(row["adjusted_offense"], 2), "adjusted_defense": round(row["adjusted_defense"], 2), "league_average": round(row["league_average"], 2), "points": round(row["points"], 2), "allowed": round(row["allowed"], 2)})
    model_fingerprint = hashlib.sha256(json.dumps({"model_version": MODEL_VERSION, **{str(season): receipt.get("sha256") for season, receipt in training_receipts.items()}, str(VALIDATION_SEASON): validation_receipt.get("sha256"), "schedule": receipt_schedule.get("sha256")}, sort_keys=True).encode()).hexdigest()[:12]
    edition = {
        "schema_version": 1,
        "model_id": f"{MODEL_VERSION}-{model_fingerprint}",
        "sport": "basketball",
        "gender": "women",
        "target_season": 2027,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "model_status": "published",
        "method": "Multi-season opponent-adjusted offensive and defensive scoring units, shrunk for sample size, with home court estimated after team-strength correction and a nominal 80% margin interval fit from training residuals; the latest completed season is held out for validation before the target refit.",
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
        "market_comparison": {
            "status": "awaiting_qualified_capture",
            "forecast_rows": len(forecasts),
            "qualified_line_rows": 0,
            "required_fields": ["exact_game_id", "captured_at_before_start", "market_type", "line_or_price"],
            "note": "No betting line is inferred. A comparison is shown only after an authorized quote is joined to this model edition with an exact game ID and a pre-tip capture clock.",
        },
        "forecasts": forecasts,
        "team_ratings": team_ratings,
        "receipts": {**{f"team_box_{season}": {"sha256": receipt.get("sha256"), "url": receipt.get("url")} for season, receipt in training_receipts.items()}, f"team_box_{VALIDATION_SEASON}": {"sha256": validation_receipt.get("sha256"), "url": validation_receipt.get("url")}, "schedule_2027": {"sha256": receipt_schedule.get("sha256"), "url": receipt_schedule.get("url")}},
        "limitations": ["This is a separate women’s model; men’s ratings and forecasts are never substituted.", "It uses team box-score history and does not incorporate a betting line or injury feed.", "Cold-start rows are explicitly labeled when either team has fewer than five training games."],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(edition, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(forecasts):,} forecasts; validation MAE {validation['margin_mae']})")


if __name__ == "__main__":
    main()
