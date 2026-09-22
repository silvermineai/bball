import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "check_basketball_game_readiness",
    ROOT / "scripts/check_basketball_game_readiness.py",
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def prediction(unknown_teams):
    return {
        "away_score": 65.0,
        "home_score": 70.0,
        "home_margin": 5.0,
        "total": 135.0,
        "pace": 68.0,
        "home_win_probability": 0.62,
        "margin_low": -9.0,
        "margin_high": 19.0,
        "estimate_type": "cold_start",
        "unknown_teams": unknown_teams,
    }


def calibrated_prediction():
    value = prediction([])
    value.update({"estimate_type": "primary", "unknown_teams": [], "total_low": 117.0, "total_high": 153.0, "total_half_width": 18.0})
    return value


class BasketballGameReadinessTests(unittest.TestCase):
    def test_cold_start_names_the_participant_outside_the_model_field(self):
        MODULE.validate_cold_start(
            prediction(["2"]), "game-1", "1", "2", {"1", "3"}
        )

    def test_cold_start_rejects_missing_or_unrelated_unknown_teams(self):
        for unknown in ([], ["3"], ["2", "2"]):
            with self.subTest(unknown=unknown), self.assertRaisesRegex(
                ValueError, "unknown teams"
            ):
                MODULE.validate_cold_start(
                    prediction(unknown), "game-1", "1", "2", {"1", "3"}
                )

    def test_cold_start_rejects_a_matchup_fully_inside_the_model_field(self):
        with self.assertRaisesRegex(ValueError, "model field"):
            MODULE.validate_cold_start(
                prediction(["2"]), "game-1", "1", "2", {"1", "2"}
            )

    def test_calibrated_total_interval_requires_complete_symmetric_range(self):
        MODULE.validate_prediction(
            calibrated_prediction(), "game-1 primary prediction", require_total_interval=True
        )
        for field in ("total_low", "total_high", "total_half_width"):
            value = calibrated_prediction()
            value.pop(field)
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                MODULE.validate_prediction(value, "game-1 primary prediction", require_total_interval=True)

    def test_calibrated_total_interval_rejects_width_or_bounds_mismatch(self):
        for update in (
            {"total_half_width": 17.0},
            {"total_low": 120.0},
            {"total_high": 150.0},
        ):
            value = calibrated_prediction()
            value.update(update)
            with self.subTest(update=update), self.assertRaisesRegex(ValueError, "total interval"):
                MODULE.validate_prediction(value, "game-1 primary prediction", require_total_interval=True)


if __name__ == "__main__":
    unittest.main()
