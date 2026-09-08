import json
import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.basketball import (
    ROOT,
    adjusted_factor_ratings,
    canonical_date,
    ingest,
    player_index,
    publisher_leaders,
    roster_changes,
)
from ncaa_scraper.basketball_model import (
    fallback_forecast,
    fit,
    forecast,
    game_features,
    train,
)


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

    def test_cold_start_estimate_is_explicit_and_wider(self):
        games = [sample(i, y) for y in [2024, 2025, 2026] for i in range(180)]
        model = train(games, "2026-09-05T00:00:00Z")
        game = {**sample(1, 2027), "home_id": "unseen"}
        estimate = fallback_forecast(model, game)
        self.assertEqual(estimate["estimate_type"], "cold_start")
        self.assertIn("unseen", estimate["unknown_teams"])
        self.assertGreater(
            estimate["margin_high"] - estimate["home_margin"],
            model["calibration"]["margin_half_width"],
        )

    def test_adjusted_four_factors_require_complete_paired_boxes(self):
        games = [sample(i, 2026) for i in range(45)]
        boxes = {}
        for game in games:
            for side in ("home", "away"):
                team_id = game[f"{side}_id"]
                boxes[(game["id"], team_id)] = {
                    "field_goals_made": 30,
                    "field_goals_attempted": 60,
                    "three_point_field_goals_made": 8,
                    "three_point_field_goals_attempted": 24,
                    "free_throws_attempted": 16,
                    "offensive_rebounds": 9,
                    "defensive_rebounds": 24,
                    "turnovers": 11,
                }
        model = {"teams": [str(i) for i in range(6)]}
        ratings = adjusted_factor_ratings(model, games, boxes, 2026)
        self.assertIn("adj_off_efg", ratings["0"])
        self.assertIn("adj_def_orb", ratings["1"])
        incomplete_boxes = {
            key: {**value, "field_goals_attempted": None}
            for key, value in boxes.items()
        }
        incomplete = adjusted_factor_ratings(model, games, incomplete_boxes, 2026)
        self.assertNotIn("adj_off_efg", incomplete["0"])


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

    def test_roster_observations_attach_recorded_prior_production(self):
        self.conn.execute(
            "INSERT INTO bb_participation VALUES (?,?,?,?,?,?)",
            (2026, "A", "1", "A Player", 20, 500),
        )
        self.conn.execute(
            "INSERT INTO bb_rosters VALUES (?,?,?,?)",
            (2027, "A", "1", json.dumps({"full_name": "A Player", "team_display_name": "A"})),
        )
        board = roster_changes(
            self.conn,
            prior_players={
                "players": [
                    {
                        "id": "1",
                        "team_id": "A",
                        "team": "A",
                        "games": 20,
                        "minutes": 500,
                        "mpg": 25.0,
                        "ppg": 14.0,
                        "rpg": 6.0,
                        "apg": 3.0,
                        "spg": 1.5,
                        "bpg": 0.5,
                        "topg": 1.2,
                        "efg": 0.58,
                        "ts": 0.61,
                        "three_pct": 0.36,
                        "ft_rate": 0.22,
                        "three_rate": 0.41,
                        "tov_rate": 0.14,
                    }
                ]
            },
        )
        production = board["players"][0]["prior_production"]
        self.assertEqual(production["games"], 20)
        self.assertEqual(production["minutes"], 500.0)
        self.assertEqual(production["mpg"], 25.0)
        self.assertEqual(production["ppg"], 14.0)
        self.assertEqual(production["efg"], 0.58)
        self.assertEqual(production["ts"], 0.61)
        self.assertEqual(production["qualified"], True)

    def test_roster_changes_publish_team_workload_summary(self):
        self.conn.execute(
            "INSERT INTO bb_participation VALUES (?,?,?,?,?,?)",
            (2026, "A", "1", "A Player", 20, 500),
        )
        self.conn.executemany(
            "INSERT INTO bb_rosters VALUES (?,?,?,?)",
            [
                (2027, "A", "1", json.dumps({"full_name": "A Player", "team_display_name": "A"})),
                (2027, "A", "2", json.dumps({"full_name": "New Player", "team_display_name": "A"})),
            ],
        )
        board = roster_changes(
            self.conn,
            prior_players={
                "players": [
                    {"id": "1", "team_id": "A", "team": "A", "games": 20, "minutes": 500},
                ]
            },
        )
        summary = board["team_summaries"][0]
        self.assertEqual(summary["returning_players"], 1)
        self.assertEqual(summary["returning_minutes"], 500.0)
        self.assertEqual(summary["prior_minutes"], 500.0)
        self.assertEqual(summary["returning_minutes_share"], 1.0)

    def test_roster_changes_exclude_team_placeholder_rows(self):
        self.conn.executemany(
            "INSERT INTO bb_rosters VALUES (?,?,?,?)",
            [
                (2027, "A", "team-row", json.dumps({"full_name": " Team"})),
                (2027, "A", "player-row", json.dumps({"full_name": "A Player", "team_display_name": "A"})),
            ],
        )
        board = roster_changes(self.conn)
        self.assertEqual(board["players_observed"], 1)
        self.assertEqual(board["unusable_rows"], 1)
        self.assertEqual([p["name"] for p in board["players"]], ["A Player"])

    def test_publisher_leaders_use_numeric_source_fields_and_ties(self):
        self.conn.execute(
            "INSERT INTO bb_players VALUES (?,?,?)", ("1", "A Player", "G")
        )
        self.conn.execute(
            "INSERT INTO bb_players VALUES (?,?,?)", ("2", "B Player", "F")
        )
        self.conn.execute(
            "INSERT INTO bb_games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("g", 2026, "2026-01-01T00:00:00Z", "T", "U", "Team T", "Team U", 1, 0, 1, 0, 2, 0, None, None),
        )
        source = lambda points: {
            "averages": {
                "gamesPlayed": {"value": 15},
                "avgPoints": {"value": points, "display": str(points)},
            }
        }
        self.conn.executemany(
            "INSERT INTO bb_player_season VALUES (?,?,?,?)",
            [(2026, "T", "1", json.dumps(source(20))), (2026, "U", "2", json.dumps(source(20)))],
        )
        result = publisher_leaders(self.conn)
        points = next(m for m in result["metrics"] if m["key"] == "avg_points")
        self.assertEqual([r["rank"] for r in points["leaders"]], [1, 1])
        self.assertEqual([r["display"] for r in points["leaders"]], ["20", "20"])


if __name__ == "__main__":
    unittest.main()
