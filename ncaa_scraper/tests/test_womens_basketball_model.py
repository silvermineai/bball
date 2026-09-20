import importlib.util
from pathlib import Path


_SCRIPT = Path(__file__).resolve().parents[2] / "scripts/publish-womens-basketball-model.py"
_SPEC = importlib.util.spec_from_file_location("womens_model", _SCRIPT)
_MODULE = importlib.util.module_from_spec(_SPEC)
assert _SPEC and _SPEC.loader
_SPEC.loader.exec_module(_MODULE)
evaluate = _MODULE.evaluate
fit_team_ratings = _MODULE.fit_team_ratings
prediction = _MODULE.prediction
fit_probability_calibration = _MODULE.fit_probability_calibration
fit_margin_interval = _MODULE.fit_margin_interval
empirical_quantile = _MODULE.empirical_quantile


def rows_for_game(game_id, home_score, away_score):
    return [
        {"game_id": game_id, "team_id": "home", "team_display_name": "Home", "team_score": str(home_score), "opponent_team_score": str(away_score), "team_home_away": "home"},
        {"game_id": game_id, "team_id": "away", "team_display_name": "Away", "team_score": str(away_score), "opponent_team_score": str(home_score), "team_home_away": "away"},
    ]


def test_womens_model_has_explicit_training_and_prediction_contract():
    rows = rows_for_game("1", 80, 60) + rows_for_game("2", 70, 65)
    ratings, home_advantage = fit_team_ratings(rows)
    forecast = prediction("home", "away", ratings, home_advantage)
    assert forecast["estimate_type"] == "cold_start"
    assert forecast["predicted_margin"] > 0
    metrics = evaluate(rows, ratings, home_advantage)
    assert metrics["games"] == 2
    assert metrics["brier_score"] is not None


def test_womens_probability_calibration_is_fitted_on_training_games():
    rows = []
    for index in range(8):
        rows.extend(rows_for_game(str(index), 80 + index, 60))
    ratings, home_advantage = fit_team_ratings(rows)
    calibration = fit_probability_calibration(rows, ratings, home_advantage)
    assert calibration["games"] == 8
    assert len(calibration["logistic_coefficients"]) == 2
    calibrated = prediction("home", "away", ratings, home_advantage, calibration)
    assert 0 < calibrated["home_win_probability"] < 1


def test_margin_interval_uses_training_residuals_and_is_reported_on_holdout():
    rows = []
    for index in range(10):
        rows.extend(rows_for_game(str(index), 80 + index, 60))
    ratings, home_advantage = fit_team_ratings(rows)
    calibration = fit_probability_calibration(rows, ratings, home_advantage)
    interval = fit_margin_interval(rows, ratings, home_advantage, calibration)
    assert interval["interval_games"] == 10
    assert interval["margin_half_width"] >= 0.5
    assert empirical_quantile([1, 2, 3, 4, 5], 0.8) == 4
    forecast = prediction("home", "away", ratings, home_advantage, {**calibration, **interval})
    assert forecast["margin_low"] <= forecast["predicted_margin"] <= forecast["margin_high"]
    assert forecast["predicted_home_score"] + forecast["predicted_away_score"] > 100
    validation = evaluate(rows, ratings, home_advantage, {**calibration, **interval})
    assert validation["interval_games"] == 10
    assert 0 <= validation["interval_coverage"] <= 1
