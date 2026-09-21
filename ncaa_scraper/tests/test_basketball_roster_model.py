import sqlite3
import unittest

from ncaa_scraper.basketball import _prior_production
from ncaa_scraper.basketball_roster_model import (
    FEATURES,
    WORKLOAD_FEATURES,
    fit,
    metrics,
    player_watch,
    predict,
    scenario_forecast,
)


def row(i: int, target: float | None = None) -> dict:
    prior = 2.0 + i * 0.1
    return {
        "team_id": str(i),
        "prior_net": prior,
        "returning_minutes_share": 0.2 + (i % 7) / 20,
        "represented_minutes_share": 0.4 + (i % 9) / 20,
        "incoming_minutes_share": 0.1 + (i % 5) / 30,
        "listed_players": 8 + i % 5,
        "prior_bpm": -1.0 + i * 0.03,
        "represented_bpm": -0.5 + i * 0.025,
        "target_net": target if target is not None else prior + 1.5,
    }


class RosterModelTests(unittest.TestCase):
    def test_player_watch_uses_exact_ids_and_keeps_missing_bpm_visible(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE bb_participation (season INTEGER, team_id TEXT, athlete_id TEXT, name TEXT, minutes REAL);
            CREATE TABLE bb_player_value (season INTEGER, player_id TEXT, team_id TEXT, player_name TEXT, stats_json TEXT);
            CREATE TABLE bb_rosters (season INTEGER, team_id TEXT, athlete_id TEXT, profile_json TEXT);
            INSERT INTO bb_participation VALUES (2026,'team-a','p1','Returning guard',900);
            INSERT INTO bb_participation VALUES (2026,'team-a','p2','Transferred wing',800);
            INSERT INTO bb_participation VALUES (2026,'team-a','p3','Unvalued center',700);
            INSERT INTO bb_player_value VALUES (2026,'p1','team-a','Returning guard', '{"box_bpm": 4.5}');
            INSERT INTO bb_rosters VALUES (2027,'team-a','p1','{}');
            INSERT INTO bb_rosters VALUES (2027,'team-b','p2','{}');
            """
        )
        rows = player_watch(conn, 2027, 2026, limit=5)["team-a"]
        self.assertEqual([row["athlete_id"] for row in rows], ["p1", "p2", "p3"])
        self.assertTrue(rows[0]["returning"])
        self.assertFalse(rows[1]["returning"])
        self.assertTrue(rows[1]["represented"])
        self.assertIsNone(rows[2]["bpm"])
        self.assertEqual(rows[0]["weighted_bpm_minutes"], 4050.0)
        conn.close()

    def test_prior_production_preserves_publisher_value_and_weights_by_minutes(self):
        result = _prior_production(
            [
                {"team": "A", "games": 10, "minutes": 100, "ppg": 10, "rpg": 4, "orpg": 1, "drpg": 3, "apg": 2, "fpg": 2, "efg": 0.5, "ts": 0.52, "box_bpm": 2.0},
                {"team": "B", "games": 10, "minutes": 300, "ppg": 20, "rpg": 6, "orpg": 2, "drpg": 4, "apg": 4, "fpg": 3, "efg": 0.6, "ts": 0.62, "box_bpm": 6.0},
            ]
        )
        self.assertEqual(result["box_bpm"], 5.0)
        self.assertIsNone(result["box_obpm"])
        self.assertEqual(result["orpg"], 1.5)
        self.assertEqual(result["drpg"], 3.5)
        self.assertEqual(result["fpg"], 2.5)

    def test_fit_uses_declared_features_and_predicts(self):
        model = fit([row(i) for i in range(25)])
        self.assertEqual(model["features"], list(FEATURES))
        self.assertEqual(model["rows"], 25)
        prediction = predict(model, row(2))
        self.assertIsNotNone(prediction)
        self.assertGreater(prediction, 3.0)
        self.assertLess(prediction, 5.0)

    def test_metrics_compares_challenger_with_prior_net(self):
        model = fit([row(i) for i in range(25)])
        result = metrics(model, [row(i, target=2.0 + i * 0.1 + 2.0) for i in range(25)])
        self.assertEqual(result["teams"], 25)
        self.assertIsNotNone(result["mae"])
        self.assertIsNotNone(result["baseline_mae"])

    def test_missing_source_feature_is_not_imputed(self):
        model = fit([row(i) for i in range(25)])
        incomplete = row(1)
        incomplete["returning_minutes_share"] = None
        self.assertIsNone(predict(model, incomplete))

    def test_workload_replay_keeps_box_bpm_out_of_the_feature_set(self):
        model = fit([row(i) for i in range(25)], WORKLOAD_FEATURES)
        self.assertEqual(model["features"], list(WORKLOAD_FEATURES))
        workload_row = row(1)
        workload_row["prior_bpm"] = None
        workload_row["represented_bpm"] = None
        self.assertIsNotNone(predict(model, workload_row))

    def test_scenario_forecast_reuses_primary_calibration(self):
        result = scenario_forecast(
            {
                "id": "basketball-efficiency-v2-test",
                "calibration": {
                    "logistic_coefficients": [0.1, 0.2],
                    "margin_half_width": 12.5,
                },
            },
            5.0,
        )
        self.assertEqual(result["primary_model_id"], "basketball-efficiency-v2-test")
        self.assertAlmostEqual(result["roster_home_win_probability"], 0.75026, places=5)
        self.assertEqual(result["roster_margin_low"], -7.5)
        self.assertEqual(result["roster_margin_high"], 17.5)

    def test_scenario_forecast_rejects_missing_calibration(self):
        with self.assertRaisesRegex(ValueError, "calibration"):
            scenario_forecast({"id": "basketball-efficiency-v2-test"}, 5.0)


if __name__ == "__main__":
    unittest.main()
