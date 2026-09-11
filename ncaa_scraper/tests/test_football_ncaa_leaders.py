import json
import sqlite3
import unittest

from ncaa_scraper.football_ncaa_leaders import build_leaders


class FootballNCAALeaderTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript(
            """
            CREATE TABLE football_stats (
              dataset TEXT, season INTEGER, record_key TEXT,
              athlete_id TEXT, team_id TEXT, game_id TEXT,
              category TEXT, stats_json TEXT
            );
            """
        )

    def add(self, key, category, team, game, payload):
        self.conn.execute(
            "INSERT INTO football_stats VALUES (?,?,?,?,?,?,?,?)",
            ("ncaa_player_stats", 2025, key, None, team, game, category, json.dumps(payload)),
        )

    def test_aggregates_players_and_excludes_team_rows(self):
        self.add("1", "rushing", "10", "g1", {"name": "A. Runner", "position": "RB", "number": "1", "rush_yds_gained": "80", "rush_attempts": "10", "rush_tds": "1", "category": "rushing"})
        self.add("2", "rushing", "10", "g2", {"name": "A. Runner", "position": "RB", "number": "1", "rush_yds_gained": "120", "rush_attempts": "12", "rush_tds": "2", "category": "rushing"})
        self.add("3", "rushing", "10", "g2", {"name": "Team Name", "rush_yds_gained": "200", "rush_attempts": "30", "category": "rushing"})
        result = build_leaders(self.conn, 2025, limit=10)
        rushing = next(item for item in result["categories"] if item["key"] == "rushing")
        self.assertEqual(len(rushing["leaders"]), 1)
        self.assertEqual(rushing["leaders"][0]["name"], "A. Runner")
        self.assertEqual(rushing["leaders"][0]["primary"], 200)
        self.assertEqual(rushing["leaders"][0]["games"], 2)
        self.assertEqual(rushing["leaders"][0]["metrics"]["rush_tds"], 3)

    def test_keeps_categories_separate(self):
        self.add("1", "passing", "10", "g1", {"name": "Dual", "position": "QB", "number": "1", "pass_yards": "100", "category": "passing"})
        self.add("2", "receiving", "10", "g1", {"name": "Dual", "position": "WR", "number": "1", "receiving_yards": "40", "category": "receiving"})
        result = build_leaders(self.conn, 2025)
        self.assertEqual(len(next(item for item in result["categories"] if item["key"] == "passing")["leaders"]), 1)
        self.assertEqual(len(next(item for item in result["categories"] if item["key"] == "receiving")["leaders"]), 1)


if __name__ == "__main__":
    unittest.main()
