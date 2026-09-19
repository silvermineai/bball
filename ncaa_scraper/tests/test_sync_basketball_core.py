import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "sync_basketball_core", ROOT / "scripts/sync-basketball-core.py"
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BasketballCoreSyncTests(unittest.TestCase):
    def test_forecast_records_keeps_primary_and_cold_start_estimates(self):
        overview = {
            "upcoming": [
                {"id": "primary", "prediction": {"home_margin": 4}},
                {"id": "cold", "prediction": None, "fallback_prediction": {"home_margin": -2}},
                {"id": "missing", "prediction": None, "fallback_prediction": None},
            ]
        }
        rows = list(MODULE.forecast_records(overview))
        self.assertEqual([game["id"] for game, _ in rows], ["primary", "cold"])
        self.assertEqual(rows[1][1]["home_margin"], -2)

    def test_published_model_metadata_declares_complete_forecast_count(self):
        model = {
            "version": "basketball-efficiency-v2",
            "target_season": 2027,
            "training_games": 100,
            "efficiency": [1, 2, 3],
        }
        metadata = MODULE.published_model_metadata(model, 1629)
        self.assertEqual(metadata["expected_forecasts"], 1629)
        self.assertEqual(metadata["target_season"], 2027)
        self.assertNotIn("efficiency", metadata)

    def test_roster_publication_keeps_exact_model_scenarios(self):
        artifact = {
            "version": "basketball-roster-challenger-v2",
            "generated_at": "2026-09-19T00:00:00Z",
            "primary_model_id": "model-1",
            "coverage": {"scenario_games": 1},
            "teams": [{"team_id": "1"}],
            "scenarios": [
                {
                    "game_id": "game-1",
                    "home_id": "1",
                    "away_id": "2",
                    "primary_model_id": "model-1",
                }
            ],
        }
        metadata, scenarios = MODULE.roster_publication(
            artifact, "model-1", {"game-1"}
        )
        self.assertEqual(metadata["primary_model_id"], "model-1")
        self.assertNotIn("teams", metadata)
        self.assertNotIn("scenarios", metadata)
        self.assertEqual(scenarios, artifact["scenarios"])

    def test_roster_publication_rejects_cross_edition_relabeling(self):
        artifact = {
            "generated_at": "2026-09-19T00:00:00Z",
            "primary_model_id": "model-old",
            "scenarios": [],
        }
        with self.assertRaisesRegex(ValueError, "does not match"):
            MODULE.roster_publication(artifact, "model-new", set())

    def test_roster_publication_rejects_rows_outside_forecast_slate(self):
        artifact = {
            "generated_at": "2026-09-19T00:00:00Z",
            "primary_model_id": "model-1",
            "scenarios": [
                {
                    "game_id": "game-2",
                    "home_id": "1",
                    "away_id": "2",
                    "primary_model_id": "model-1",
                }
            ],
        }
        with self.assertRaisesRegex(ValueError, "outside the forecast slate"):
            MODULE.roster_publication(artifact, "model-1", {"game-1"})


if __name__ == "__main__":
    unittest.main()
