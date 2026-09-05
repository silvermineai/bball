import json
import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.basketball import (
    ROOT,
    canonical_date,
    ingest,
    player_index,
    roster_changes,
)
from ncaa_scraper.basketball_model import fit, forecast, game_features, train


def sample(i, season):
    home = i % 6
    away = (i + 1 + i % 4) % 6
    if home == away:
        away = (away + 1) % 6
    return {
        "id": f"{season}-{i}",
        "season": season,
        "starts_at": f"{season}-02-01T12:00:00Z",
        "home_id": str(home),
        "away_id": str(away),
        "home_name": str(home),
        "away_name": str(away),
        "home_score": 70 + home * 2 + i % 11,
        "away_score": 65 + away * 2 + i % 7,
        "completed": 1,
        "neutral": i % 3 == 0,
        "periods": 2,
        "home_eff": 103 + home * 2 + i % 11,
        "away_eff": 99 + away * 2 + i % 7,
        "possessions": 70.0,
        "pace": 70.0 + i % 7,
    }


class BasketballModelTests(unittest.TestCase):
    def test_possessions_require_both_boxes_and_preserve_overtime(self):
        game = sample(1, 2026)
        game["periods"] = 3
        box = {
            "field_goals_attempted": 60,
            "free_throws_attempted": 20,
            "offensive_rebounds": 10,
            "turnovers": 12,
        }
        boxes = {
            (game["id"], game["home_id"]): box.copy(),
            (game["id"], game["away_id"]): box.copy(),
        }
        features = game_features(game, boxes)
        self.assertEqual(features["possessions"], 71.5)
        self.assertAlmostEqual(features["pace"], 71.5 * 40 / 45)
        boxes[(game["id"], game["away_id"])]["free_throws_attempted"] = None
        self.assertIsNone(game_features(game, boxes))

    def test_three_windows_are_separate_and_future_results_cannot_leak(self):
        games = [sample(i, y) for y in [2024, 2025, 2026] for i in range(180)]
        cutoff = "2026-09-05T00:00:00Z"
        with patch("ncaa_scraper.basketball_model.fit", wraps=fit) as calls:
            model = train(games, cutoff)
        self.assertEqual(
            [{g["season"] for g in call.args[0]} for call in calls.call_args_list],
            [{2024}, {2024, 2025}, {2024, 2025, 2026}],
        )
        self.assertEqual(model["calibration"]["season"], 2025)
        self.assertEqual(model["evaluation"]["season"], 2026)
        self.assertEqual(model, train(games + [sample(1, 2027)], cutoff))
        changed = [
            {**g, "home_score": g["home_score"] + 50} if g["season"] == 2026 else g
            for g in games
        ]
        self.assertEqual(model["calibration"], train(changed, cutoff)["calibration"])
        p = forecast(model, sample(3, 2027))
        self.assertTrue(0 <= p["home_win_probability"] <= 1)
        self.assertLess(p["margin_low"], p["home_margin"])
        self.assertIsNone(forecast(model, {**sample(1, 2027), "home_id": "unseen"}))


class BasketballIngestTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(
            (ROOT / "worker/migrations/0009_basketball_research.sql").read_text()
        )

    def tearDown(self):
        self.conn.close()

    def test_unidentified_rows_are_retained_without_guessed_identity(self):
        row = {
            "game_id": "1",
            "team_id": "2",
            "athlete_id": "",
            "athlete_short_name": "A. Player",
            "minutes": "",
            "did_not_play": "true",
        }
        ingest(self.conn, "player_box", 2026, [row], {})
        self.assertEqual(
            self.conn.execute("SELECT count(*) FROM bb_player_box").fetchone()[0], 0
        )
        self.assertEqual(
            self.conn.execute("SELECT count(*) FROM bb_unresolved").fetchone()[0], 1
        )

    def test_future_source_zeros_do_not_become_final_scores(self):
        row = {
            "game_id": "1",
            "home_id": "2",
            "away_id": "3",
            "date": "2026-11-01T19:00:00-05:00",
            "home_score": "0",
            "away_score": "0",
            "status_type_completed": "false",
        }
        ingest(self.conn, "schedule", 2027, [row], {})
        g = self.conn.execute("SELECT * FROM bb_games").fetchone()
        self.assertIsNone(g["home_score"])
        self.assertIsNone(g["away_score"])
        self.assertEqual(g["starts_at"], "2026-11-02T00:00:00Z")
        with self.assertRaises(ValueError):
            canonical_date("2026-11-01T19:00:00")

    def test_roster_absence_is_not_a_departure_and_names_do_not_join(self):
        self.conn.execute(
            "INSERT INTO bb_participation VALUES (?,?,?,?,?,?)",
            (2026, "A", "1", "Same Name", 10, 200),
        )
        self.conn.execute(
            "INSERT INTO bb_participation VALUES (?,?,?,?,?,?)",
            (2026, "B", "3", "Another", 10, 200),
        )
        for aid, tid in [("2", "C"), ("3", "D")]:
            profile = {"full_name": "Same Name", "team_display_name": tid}
            self.conn.execute(
                "INSERT INTO bb_rosters VALUES (?,?,?,?)",
                (2027, tid, aid, json.dumps(profile)),
            )
        board = roster_changes(self.conn)
        states = {p["id"]: p["status"] for p in board["players"]}
        self.assertEqual(states, {"2": "new_to_dataset", "3": "different_program"})
        self.assertEqual(board["prior_players_not_observed"], 1)
        self.assertNotIn("departed", board["status_counts"])

    def test_player_index_with_no_games_is_well_formed(self):
        self.assertEqual(
            player_index(self.conn), {"season": 2026, "players": [], "box_games": 0}
        )


if __name__ == "__main__":
    unittest.main()
