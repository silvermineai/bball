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


if __name__ == "__main__":
    unittest.main()
