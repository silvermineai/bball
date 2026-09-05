"""Temporal integrity and ingest behavior, independent of network availability."""

import json
import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.football import ROOT, number, store_rows
from ncaa_scraper.football_model import eligible, fit, forecast, train_and_evaluate


def game(i, year=2024):
    return {
        "id": str(i),
        "season": year,
        "kickoff": f"{year}-09-01T12:00:00Z",
        "home_id": str(i % 5),
        "away_id": str((i + 1) % 5),
        "home_score": 28 + i % 11,
        "away_score": 17 + i % 7,
        "completed": 1,
        "neutral": i % 3 == 0,
        "home_division": "fbs",
        "away_division": "fbs",
    }


class ModelTests(unittest.TestCase):
    def test_future_scores_and_missing_scores_are_excluded(self):
        cutoff = "2026-09-04T00:00:00Z"
        self.assertFalse(eligible(game(1, 2027), cutoff))
        missing = game(1)
        missing["home_score"] = None
        self.assertFalse(eligible(missing, cutoff))
        pending = game(1)
        pending["completed"] = 0
        self.assertFalse(eligible(pending, cutoff))

    def test_holdout_never_enters_evaluation_fit(self):
        rows = [game(i, y) for y in [2022, 2023, 2024, 2025] for i in range(150)]
        with patch("ncaa_scraper.football_model.fit", wraps=fit) as tracked:
            model = train_and_evaluate(rows, "2026-09-04T00:00:00Z")
        self.assertEqual(
            {g["season"] for g in tracked.call_args_list[0].args[0]}, {2022, 2023, 2024}
        )
        self.assertEqual(model["evaluation"]["games"], 150)
        self.assertEqual(model["evaluation"]["training_seasons"], [2022, 2023, 2024])

    def test_future_results_cannot_change_the_model(self):
        rows = [game(i, y) for y in [2022, 2023, 2024, 2025] for i in range(150)]
        cutoff = "2026-09-04T00:00:00Z"
        first = train_and_evaluate(rows, cutoff)
        future = game(2, 2027)
        future["home_score"] = 999
        second = train_and_evaluate(rows + [future], cutoff)
        self.assertEqual(first, second)
        self.assertIsNone(forecast(first, {**game(1), "home_id": "unknown"}))
        p = forecast(first, game(1))
        self.assertTrue(0 <= p["home_win_probability"] <= 1)
        self.assertLess(p["margin_low"], p["home_margin"])
        self.assertGreater(p["margin_high"], p["home_margin"])


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript(
            (ROOT / "worker/migrations/0008_football.sql").read_text()
        )

    def tearDown(self):
        self.conn.close()

    def test_no_postgame_line_can_become_pregame(self):
        row = {
            "game_id": "1",
            "season": "2026",
            "start_date": "2026-09-01T00:00:00Z",
            "home_id": "2",
            "away_id": "3",
            "home_team": "Home",
            "away_team": "Away",
            "completed": "true",
            "home_points": "0",
            "away_points": "7",
        }
        store_rows(
            self.conn, "schedule", 2026, [row], {"fetched_at": "2026-09-04T00:00:00Z"}
        )
        odds = {"game_id": "1", "home_team_spread": "-3.5", "over_under": "44"}
        receipt = {"fetched_at": "2026-09-04T00:00:00Z"}
        store_rows(self.conn, "betting", 2026, [odds], receipt)
        store_rows(self.conn, "betting", 2026, [odds], receipt)
        self.assertEqual(
            self.conn.execute(
                "SELECT is_pregame,home_spread FROM football_markets"
            ).fetchall(),
            [(0, -3.5)],
        )
        self.assertEqual(
            self.conn.execute("SELECT home_score FROM football_games").fetchone()[0], 0
        )

    def test_unknown_values_are_not_zero(self):
        for value in ["", None, "NaN", "Infinity", "not a stat"]:
            self.assertIsNone(number(value))
        self.assertEqual(number("0"), 0)

    def test_source_unmapped_stats_are_preserved(self):
        row = {
            "athlete_id": "7",
            "athlete_name": "Test Player",
            "stat_1": "11/17",
            "passingYards": "",
            "game_id": "2",
        }
        store_rows(self.conn, "box", 2025, [row], {})
        stored = json.loads(
            self.conn.execute("SELECT stats_json FROM football_stats").fetchone()[0]
        )
        self.assertEqual(stored["stat_1"], "11/17")
        self.assertNotIn("passingYards", stored)


if __name__ == "__main__":
    unittest.main()


class SourcePolicyTests(unittest.TestCase):
    def test_ncaa_robots_denial_never_requests_the_page(self):
        import tempfile
        from unittest.mock import Mock

        from ncaa_scraper.fetcher import NCAAFetchError, ScraplingNCAAFetcher

        response = Mock(status_code=200, text="User-agent: *\nDisallow: /\n")
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("ncaa_scraper.fetcher.requests.get", return_value=response) as get,
        ):
            with self.assertRaises(NCAAFetchError):
                ScraplingNCAAFetcher(cache_dir=directory)._fetch_with_scrapling(
                    "https://stats.ncaa.org/contests/1"
                )
            self.assertEqual(get.call_count, 1)
            self.assertTrue(get.call_args.args[0].endswith("/robots.txt"))

    def test_espn_direct_fetch_is_disabled(self):
        from ncaa_scraper.espn import get_json

        with self.assertRaisesRegex(RuntimeError, "Direct ESPN automation is disabled"):
            get_json(
                "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
            )
