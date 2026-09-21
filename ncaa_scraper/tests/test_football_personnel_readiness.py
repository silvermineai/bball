import json
import sqlite3
import unittest

from ncaa_scraper.football_personnel_readiness import build


class FootballPersonnelReadinessTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript(
            """
            CREATE TABLE football_stats (
              dataset TEXT, season INTEGER, record_key TEXT, team_id TEXT,
              stats_json TEXT
            );
            CREATE TABLE football_sources (
              dataset TEXT, season INTEGER, receipt_json TEXT
            );
            """
        )
        receipt = lambda dataset: json.dumps({
            "dataset": dataset,
            "fetched_at": "2026-09-21T00:00:00Z",
            "sha256": dataset[0] * 64,
        })
        self.conn.executemany(
            "INSERT INTO football_sources VALUES (?,?,?)",
            [("team_talent", 2026, receipt("team_talent")), ("returning_production", 2026, receipt("returning_production"))],
        )

    def tearDown(self):
        self.conn.close()

    def add(self, dataset, team_id, payload, key=None):
        self.conn.execute(
            "INSERT INTO football_stats VALUES (?,?,?,?,?)",
            (dataset, 2026, key or f"{dataset}-{team_id}", team_id, json.dumps(payload)),
        )

    @staticmethod
    def game(home="1", away="2"):
        return {
            "id": "game-1",
            "kickoff": "2026-09-26T18:00:00Z",
            "home_id": home,
            "away_id": away,
            "home_name": "Home",
            "away_name": "Away",
            "home_division": "fbs",
            "away_division": "fbs",
            "prediction": {"home_margin": 3.0},
        }

    def test_exact_team_ids_and_missing_fields_are_explicit(self):
        self.add("team_talent", "1", {"team": "Home", "talent_composite": "800", "talent_rank": "12", "blue_chip_ratio": "0.4"})
        self.add("returning_production", "1", {"overall_returning": "0.55", "off_returning": "0.6", "def_returning": "0.5"})
        self.add("team_talent", "2", {"team": "Away", "talent_composite": "700", "talent_rank": "80", "blue_chip_ratio": "0.1"})
        self.add("returning_production", "2", {"overall_returning": "0.45", "off_returning": "0.5", "def_returning": "0.4"})
        payload = build(self.conn, [self.game()], primary_model_id="football-model-v2")
        self.assertEqual(payload["coverage"]["forecast_games"], 1)
        self.assertEqual(payload["primary_model_id"], "football-model-v2")
        self.assertEqual(payload["coverage"]["complete_games"], 1)
        self.assertEqual(payload["coverage"]["field_side_counts"]["overall_returning"], 2)
        self.assertEqual(payload["games"][0]["home"]["team_id"], "1")
        self.assertEqual(payload["games"][0]["away"]["team_id"], "2")
        self.assertEqual(payload["games"][0]["away"]["overall_returning"], 0.45)
        self.assertEqual(len(payload["source_receipts"]), 2)
        self.assertTrue(payload["id"].startswith("football-personnel-readiness-v1-"))

    def test_conflicting_exact_team_rows_never_look_complete(self):
        self.add("team_talent", "1", {"talent_composite": "800"}, "talent-a")
        self.add("team_talent", "1", {"talent_composite": "810"}, "talent-b")
        self.add("returning_production", "1", {"overall_returning": "0.5"})
        self.add("team_talent", "2", {"talent_composite": "700"})
        self.add("returning_production", "2", {"overall_returning": "0.4"})
        payload = build(self.conn, [self.game()])
        self.assertEqual(payload["coverage"]["conflict_games"], 1)
        self.assertEqual(payload["games"][0]["home"]["conflicting_fields"], ["talent_composite"])
        self.assertEqual(payload["games"][0]["status"], "conflict")

    def test_unforecasted_games_are_not_claimed_as_ready(self):
        game = self.game()
        game["prediction"] = None
        payload = build(self.conn, [game])
        self.assertEqual(payload["games"], [])
        self.assertEqual(payload["coverage"]["forecast_games"], 0)


if __name__ == "__main__":
    unittest.main()
