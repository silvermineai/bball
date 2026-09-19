import sqlite3
import tempfile
import unittest
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[2] / "scripts/verify-basketball-d1.py"
SPEC = importlib.util.spec_from_file_location("verify_basketball_d1", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VerifyBasketballD1Test(unittest.TestCase):
    def test_local_table_count_reads_present_table(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "warehouse.sqlite3"
            with sqlite3.connect(path) as conn:
                conn.execute("CREATE TABLE sample (id INTEGER)")
                conn.executemany("INSERT INTO sample VALUES (?)", [(1,), (2,)])
            self.assertEqual(MODULE.local_table_count(path, "sample"), 2)

    def test_local_table_count_returns_none_for_empty_placeholder(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "warehouse.sqlite3"
            path.touch()
            self.assertIsNone(MODULE.local_table_count(path, "sample"))

    @staticmethod
    def edition_fixture():
        model_id = "basketball-efficiency-v2-0123456789ab"
        overview = {
            "model": {"id": model_id},
            "upcoming": [
                {"id": "game-1", "prediction": {"home_margin": 4}},
                {"id": "game-2", "fallback_prediction": {"home_margin": -2}},
                {"id": "unmodeled"},
            ],
        }
        roster = {
            "primary_model_id": model_id,
            "coverage": {"scenario_games": 1},
            "scenarios": [{"game_id": "game-1", "primary_model_id": model_id}],
        }
        return model_id, overview, roster

    def test_current_edition_expectation_uses_generated_artifacts(self):
        model_id, overview, roster = self.edition_fixture()
        self.assertEqual(
            MODULE.current_edition_expectation(overview, roster),
            {"model_id": model_id, "forecasts": 2, "roster_scenarios": 1},
        )

    def test_current_edition_expectation_rejects_cross_edition_scenario(self):
        _, overview, roster = self.edition_fixture()
        roster["scenarios"][0]["primary_model_id"] = "basketball-efficiency-v2-ffffffffffff"
        with self.assertRaisesRegex(ValueError, "mismatched scenario"):
            MODULE.current_edition_expectation(overview, roster)

    def test_validate_current_edition_requires_complete_roster_import(self):
        model_id, overview, roster = self.edition_fixture()
        expected = MODULE.current_edition_expectation(overview, roster)
        actual = {
            "models": 1,
            "forecasts": 2,
            "expected_forecasts": 2,
            "roster_models": 1,
            "roster_scenarios": 0,
            "roster_primary_model_id": model_id,
            "mismatched_roster_scenarios": 0,
        }
        with self.assertRaisesRegex(ValueError, "roster_scenarios"):
            MODULE.validate_current_edition(expected, actual)

    def test_validate_current_edition_accepts_exact_pair(self):
        model_id, overview, roster = self.edition_fixture()
        expected = MODULE.current_edition_expectation(overview, roster)
        MODULE.validate_current_edition(
            expected,
            {
                "models": 1,
                "forecasts": 2,
                "expected_forecasts": 2,
                "roster_models": 1,
                "roster_scenarios": 1,
                "roster_primary_model_id": model_id,
                "mismatched_roster_scenarios": 0,
            },
        )


if __name__ == "__main__":
    unittest.main()
