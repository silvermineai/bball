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
