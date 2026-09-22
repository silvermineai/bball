import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "sync_basketball_core", ROOT / "scripts/sync-basketball-core.py"
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def valid_prediction(**overrides):
    prediction = {
        "away_score": 65.0,
        "home_score": 70.0,
        "home_margin": 5.0,
        "total": 135.0,
        "pace": 68.0,
        "home_win_probability": 0.62,
        "margin_low": -9.0,
        "margin_high": 19.0,
    }
    prediction.update(overrides)
    return prediction


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

    def test_forecast_payload_keeps_exact_edition_matchup_factors(self):
        game = {
            "id": "game-1",
            "matchup_factors": {
                "season": 2026,
                "factors": {
                    key: {
                        "home_offense": 0.5,
                        "home_defense": 0.4,
                        "away_offense": 0.45,
                        "away_defense": 0.35,
                    }
                    for key in ("efg", "tov", "orb", "ftr")
                },
                "edges": {key: 0.05 for key in ("efg", "tov", "orb", "ftr")},
            },
        }
        prediction = valid_prediction()
        payload = MODULE.forecast_payload(game, prediction)
        self.assertEqual(payload["home_margin"], 5.0)
        self.assertEqual(payload["matchup_factors"], game["matchup_factors"])
        self.assertNotIn("matchup_factors", prediction)

    def test_forecast_payload_fails_closed_on_malformed_matchup_factors(self):
        game = {"id": "game-1", "matchup_factors": {"season": 2026, "factors": {}, "edges": {}}}
        with self.assertRaisesRegex(ValueError, "invalid matchup factors"):
            MODULE.forecast_payload(game, valid_prediction())

    def test_forecast_payload_allows_cold_start_without_factor_context(self):
        payload = MODULE.forecast_payload(
            {"id": "cold", "matchup_factors": None},
            valid_prediction(estimate_type="cold_start", home_margin=1.2, home_score=66.2, total=131.2),
        )
        self.assertEqual(payload["estimate_type"], "cold_start")
        self.assertNotIn("matchup_factors", payload)

    def test_forecast_payload_rejects_score_and_total_mismatches(self):
        for overrides, message in (
            ({"home_margin": 4.0}, "score/margin"),
            ({"total": 136.0}, "score/total"),
        ):
            with self.subTest(overrides=overrides), self.assertRaisesRegex(ValueError, message):
                MODULE.forecast_payload({"id": "game-1", "matchup_factors": None}, valid_prediction(**overrides))

    def test_forecast_payload_rejects_partial_or_inconsistent_total_interval(self):
        for overrides, message in (
            ({"total_low": 117.0}, "incomplete"),
            ({"total_low": 120.0, "total_high": 153.0, "total_half_width": 18.0}, "width mismatch"),
            ({"total_low": 117.0, "total_high": 153.0, "total_half_width": 17.0}, "width mismatch"),
        ):
            with self.subTest(overrides=overrides), self.assertRaisesRegex(ValueError, message):
                MODULE.forecast_payload({"id": "game-1", "matchup_factors": None}, valid_prediction(**overrides))

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
        self.assertEqual(metadata["intervals"]["total"]["status"], "unavailable")

    def test_total_interval_contract_requires_every_row_for_new_editions(self):
        model = {"calibration": {"total_half_width": 18.0}}
        rows = [
            ({"id": "primary"}, {"total": 145.0, "total_low": 127.0, "total_high": 163.0}),
            ({"id": "cold"}, {"total": 140.0, "total_low": 110.0, "total_high": 170.0}),
        ]
        contract = MODULE.total_interval_contract(model, rows)
        self.assertEqual(contract["status"], "calibrated")
        self.assertEqual(contract["forecast_rows"], 2)
        metadata = MODULE.published_model_metadata(model, 2, total_interval=contract)
        self.assertEqual(metadata["intervals"]["total"]["status"], "calibrated")
        with self.assertRaisesRegex(ValueError, "missing from forecast rows"):
            MODULE.total_interval_contract(model, [(rows[0][0], {"total": 145.0})])
        with self.assertRaisesRegex(ValueError, "malformed for forecast rows"):
            MODULE.total_interval_contract(model, [(rows[0][0], {"total": 145.0, "total_low": 150.0, "total_high": 160.0})])

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

    def test_publication_manifest_hashes_exact_recovery_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            overview_path = root / "overview.json"
            roster_path = root / "roster-model.json"
            overview_path.write_text('{"overview":true}')
            roster_path.write_text('{"roster":true}')
            manifest = MODULE.publication_manifest(
                model_id="basketball-efficiency-v2-0123456789ab",
                season=2023,
                batches=[root / "basketball-core.sql"],
                forecast_rows=[object(), object()],
                roster_scenarios=[object()],
                overview={"generated_at": "2026-09-19T00:00:00Z"},
                overview_path=overview_path,
                roster_artifact={"generated_at": "2026-09-19T00:00:01Z"},
                roster_path=roster_path,
            )
        self.assertEqual(manifest["forecast_rows"], 2)
        self.assertEqual(manifest["roster_scenario_rows"], 1)
        self.assertEqual(manifest["batches"], ["basketball-core.sql"])
        self.assertEqual(
            manifest["overview_sha256"],
            hashlib.sha256(b'{"overview":true}').hexdigest(),
        )
        self.assertEqual(
            manifest["roster_sha256"],
            hashlib.sha256(b'{"roster":true}').hexdigest(),
        )


if __name__ == "__main__":
    unittest.main()
