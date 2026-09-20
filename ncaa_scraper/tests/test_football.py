"""Temporal integrity and ingest behavior, independent of network availability."""

import json
import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.football import (
    ROOT,
    box_category_production,
    datasets_for_year,
    normalize_division,
    normalize_game,
    number,
    lower_division_results,
    personnel_preview,
    player_board,
    store_rows,
)
from ncaa_scraper.football_model import (
    calibrate,
    eligible,
    fit,
    forecast,
    train_division_model,
    train_and_evaluate,
)


def game(i, year=2024):
    return {
        "id": f"{year}-{i}",
        "season": year,
        "kickoff": f"{year}-09-01T12:00:00Z",
        "home_id": str(i % 5),
        "away_id": str((i + 1) % 5),
        "home_score": (17 + i % 7) if i % 3 == 0 else (28 + i % 11),
        "away_score": (28 + i % 11) if i % 3 == 0 else (17 + i % 7),
        "completed": 1,
        "neutral": i % 3 == 0,
        "home_division": "fbs",
        "away_division": "fbs",
    }


class ModelTests(unittest.TestCase):
    def test_division_model_isolated_and_dated(self):
        rows = []
        for year in [2022, 2023, 2024, 2025, 2026]:
            for i in range(150):
                row = game(i, year)
                row["home_division"] = "d2"
                row["away_division"] = "d2"
                rows.append(row)
        mixed = game(900, 2026)
        mixed["home_id"] = "d2-only"
        mixed["away_id"] = "fbs-only"
        mixed["home_division"] = "d2"
        mixed["away_division"] = "fbs"
        rows.append(mixed)
        model = train_division_model(rows, "2026-09-04T00:00:00Z", 2026, "d2")
        self.assertEqual(model["division"], "d2")
        self.assertNotIn("fbs-only", model["teams"])
        self.assertEqual(model["training_seasons"], [2022, 2023, 2024, 2025, 2026])
        self.assertEqual(model["calibration_season"], 2024)
        future = game(901, 2027)
        future["home_division"] = future["away_division"] = "d2"
        future["home_score"] = 999
        self.assertEqual(
            model["id"],
            train_division_model(rows, "2026-09-04T00:00:00Z", 2026, "d2")["id"],
        )

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
            {g["season"] for g in tracked.call_args_list[0].args[0]}, {2022, 2023}
        )
        self.assertEqual(
            {g["season"] for g in tracked.call_args_list[1].args[0]}, {2022, 2023, 2024}
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

    def test_holdout_changes_cannot_recalibrate_probabilities_or_ranges(self):
        rows = [game(i, y) for y in [2022, 2023, 2024, 2025] for i in range(150)]
        a, b = {}, {}
        first = train_and_evaluate(rows, "2026-09-04T00:00:00Z", validation_out=a)
        changed = [
            {**g, "home_score": g["home_score"] + 100} if g["season"] == 2025 else g
            for g in rows
        ]
        second = train_and_evaluate(changed, "2026-09-04T00:00:00Z", validation_out=b)
        self.assertEqual(first["calibration"], second["calibration"])
        self.assertEqual(a["evaluation_model"], b["evaluation_model"])
        self.assertNotEqual(
            first["evaluation"]["margin_mae"], second["evaluation"]["margin_mae"]
        )
        self.assertFalse(
            set(a["initial_training_ids"])
            & {r["game"]["id"] for r in a["calibration_predictions"]}
        )
        self.assertFalse(
            set(a["evaluation_training_ids"])
            & {r["game"]["id"] for r in a["evaluation_predictions"]}
        )
        self.assertEqual(
            sum(r["games"] for r in first["evaluation"]["reliability"]),
            first["evaluation"]["binary_games"],
        )

    def test_calibration_requires_enough_games_and_both_outcomes(self):
        rows = [game(i) for i in range(150)]
        model = fit(rows)
        with self.assertRaisesRegex(ValueError, "100"):
            calibrate(rows[:99], model)
        with self.assertRaisesRegex(ValueError, "both home and away wins"):
            calibrate([{**g, "home_score": 100} for g in rows], model)

    def test_legacy_model_keeps_original_probability_and_interval(self):
        import math

        old = {
            "teams": ["h", "a"],
            "margin_coef": [0, 3, 2, -2],
            "total_coef": [40, 2, 4, 3],
            "sigma": 10,
        }
        result = forecast(old, {"home_id": "h", "away_id": "a", "neutral": 0})
        self.assertEqual(result["home_margin"], 7)
        self.assertEqual(
            result["home_win_probability"],
            round(0.5 * (1 + math.erf(7 / (10 * math.sqrt(2)))), 4),
        )
        self.assertEqual(result["margin_low"], round(7 - 1.281552 * 10, 1))


class ImportTests(unittest.TestCase):
    def test_box_defensive_and_specialist_totals_stay_exact_id_and_fail_closed_on_blanks(self):
        defensive = box_category_production(
            [
                {
                    "category": "defensive",
                    "game_id": "g1",
                    "totalTackles": "7",
                    "soloTackles": "4",
                    "sacks": "1.5",
                    "passesDefended": "",
                },
                {
                    "category": "defensive",
                    "game_id": "g2",
                    "totalTackles": "",
                    "soloTackles": "2",
                    "sacks": "0",
                    "passesDefended": "1",
                },
                # A different category cannot bleed into the defensive row.
                {"category": "passing", "game_id": "g3", "totalTackles": "99"},
            ],
            "defensive",
        )
        self.assertEqual(defensive, {
            "records": 2,
            "games": 2,
            "metrics": {
                "tackles": 7,
                "solo_tackles": 6,
                "sacks": 1.5,
                "passes_defended": 1,
            },
        })
        kicking = box_category_production(
            [
                {
                    "category": "kicking",
                    "game_id": "g1",
                    "fieldGoalsMade/fieldGoalAttempts": "2/3",
                    "extraPointsMade/extraPointAttempts": "4/4",
                    "totalKickingPoints": "10",
                },
                {
                    "category": "kicking",
                    "game_id": "g2",
                    "fieldGoalsMade/fieldGoalAttempts": "0/1",
                    "extraPointsMade/extraPointAttempts": "",
                    "totalKickingPoints": "0",
                },
            ],
            "kicking",
        )
        self.assertEqual(kicking["records"], 2)
        self.assertEqual(kicking["games"], 2)
        self.assertEqual(kicking["metrics"]["field_goals_made"], 2)
        self.assertEqual(kicking["metrics"]["field_goals_attempted"], 4)
        self.assertEqual(kicking["metrics"]["field_goal_pct"], 0.5)
        self.assertEqual(kicking["metrics"]["extra_point_pct"], 1)

    def test_player_board_adds_exact_id_box_production_but_not_name_only_events(self):
        store_rows(self.conn, "teams", 2025, [{"team_id": "11", "division": "fbs", "short_display_name": "Alpha"}], {"fetched_at": "2026-01-01T00:00:00Z"})
        store_rows(
            self.conn,
            "box",
            2025,
            [{
                "athlete_id": "7", "athlete_name": "Defender", "team_id": "11",
                "game_id": "g1", "category": "defensive", "totalTackles": "8",
                "sacks": "1",
            }],
            {"fetched_at": "2026-01-01T00:00:00Z"},
        )
        store_rows(
            self.conn,
            "defense",
            2025,
            [{"def_pos_team_id": "11", "player_name": "Defender", "game_id": "g1", "season": "2025", "sacks": "9"}],
            {"fetched_at": "2026-01-01T00:00:00Z"},
        )
        board = player_board(self.conn, 2025)
        player = board["players"][0]
        self.assertEqual(player["id"], "7")
        self.assertEqual(player["production"]["defensive"]["metrics"], {"sacks": 1, "tackles": 8})
        # The advanced name-only release is deliberately not joined or added.
        self.assertEqual(player["production"]["defensive"]["metrics"]["sacks"], 1)

    def test_schedule_divisions_are_canonicalized_at_the_source_boundary(self):
        self.assertEqual(normalize_division("ii"), "d2")
        self.assertEqual(normalize_division("iii"), "d3")
        self.assertEqual(normalize_division("fbs"), "fbs")
        self.assertIsNone(normalize_division(""))

    def test_schedule_rows_preserve_lower_division_identity_without_inventing_stats(self):
        row = {
            "game_id": "d2-game",
            "season": "2026",
            "start_date": "2026-09-01T00:00:00Z",
            "home_id": "d2-home",
            "away_id": "d2-away",
            "home_division": "ii",
            "away_division": "iii",
            "completed": "false",
        }
        game_row = normalize_game(row)
        self.assertEqual(game_row["home_division"], "d2")
        self.assertEqual(game_row["away_division"], "d3")

    def test_lower_results_are_scoped_and_missing_scores_do_not_change_records(self):
        rows = [
            {
                "id": "complete-cross",
                "season": 2026,
                "kickoff": "2026-09-01T00:00:00Z",
                "home_id": "d2-home",
                "away_id": "d3-away",
                "home_name": "D2 Home",
                "away_name": "D3 Away",
                "home_division": "d2",
                "away_division": "iii",
                "home_score": 21,
                "away_score": 14,
                "completed": 1,
                "neutral": 0,
            },
            {
                "id": "missing-d2",
                "season": 2026,
                "kickoff": "2026-09-02T00:00:00Z",
                "home_id": "d2-home",
                "away_id": "d2-other",
                "home_name": "D2 Home",
                "away_name": "D2 Other",
                "home_division": "ii",
                "away_division": "ii",
                "home_score": None,
                "away_score": None,
                "completed": 1,
                "neutral": 0,
            },
            {
                "id": "future",
                "season": 2026,
                "kickoff": "2026-09-03T00:00:00Z",
                "home_id": "d2-home",
                "away_id": "d2-other",
                "home_division": "d2",
                "away_division": "d2",
                "home_score": 99,
                "away_score": 0,
                "completed": 0,
                "neutral": 0,
            },
        ]
        artifact = lower_division_results(rows, 2026, "2026-09-04T00:00:00Z")
        self.assertEqual(artifact["coverage"]["d2"], {"games": 2, "score_complete": 1, "scores_missing": 1, "upcoming_games": 0, "forecast_games": 0})
        self.assertEqual(artifact["coverage"]["d3"], {"games": 1, "score_complete": 1, "scores_missing": 0, "upcoming_games": 0, "forecast_games": 0})
        self.assertEqual(len(artifact["rows"]), 3)
        self.assertEqual(artifact["teams"]["d2"][0]["wins"], 1)
        self.assertEqual(artifact["teams"]["d3"][0]["losses"], 1)

    def test_dataset_selection_keeps_full_ncaa_player_history(self):
        self.assertEqual(datasets_for_year(2026, 2013), ["ncaa_player_stats"])
        self.assertIn("ncaa_player_stats", datasets_for_year(2026, 2022))
        self.assertIn("ncaa_player_stats", datasets_for_year(2026, 2025))
        self.assertNotIn("ncaa_player_stats", datasets_for_year(2026, 2026))
        self.assertIn("rosters", datasets_for_year(2026, 2026))
        self.assertIn("recruits", datasets_for_year(2026, 2025))
        self.assertIn("team_talent", datasets_for_year(2026, 2026))
        self.assertEqual(datasets_for_year(2027, 2012), [])

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

    def test_personnel_preview_is_static_and_deterministic(self):
        store_rows(
            self.conn,
            "rosters",
            2026,
            [
                {
                    "athlete_id": "2",
                    "athlete_display_name": "Beta Player",
                    "team_id": "9",
                    "team_short_display_name": "Beta",
                    "position_abbreviation": "WR",
                    "experience_display_value": "Junior",
                    "status_name": "Active",
                    "height": 72,
                    "weight": 195,
                },
                {
                    "athlete_id": "1",
                    "athlete_display_name": "Alpha Player",
                    "team_id": "3",
                    "team_short_display_name": "Alpha",
                    "position_abbreviation": "QB",
                    "experience_display_value": "Senior",
                    "status_name": "Active",
                    "height": 76.0,
                    "weight": 220.0,
                },
            ],
            {"fetched_at": "2026-09-17T00:00:00Z"},
        )
        self.assertEqual(
            personnel_preview(self.conn, 2026),
            [
                {
                    "id": "1",
                    "name": "Alpha Player",
                    "team": "Alpha",
                    "position": "QB",
                    "experience": "Senior",
                    "status": "Active",
                    "height": 76,
                    "weight": 220,
                },
                {
                    "id": "2",
                    "name": "Beta Player",
                    "team": "Beta",
                    "position": "WR",
                    "experience": "Junior",
                    "status": "Active",
                    "height": 72,
                    "weight": 195,
                },
            ],
        )

    def test_future_archive_line_still_lacks_verified_provider_clock(self):
        row = {
            "game_id": "future",
            "season": "2026",
            "start_date": "2026-09-10T12:00:00Z",
            "home_id": "2",
            "away_id": "3",
            "home_team": "Home",
            "away_team": "Away",
            "completed": "false",
            "start_time_tbd": "false",
        }
        receipt = {"fetched_at": "2026-09-04T00:00:00Z"}
        store_rows(self.conn, "schedule", 2026, [row], receipt)
        store_rows(
            self.conn,
            "betting",
            2026,
            [{"game_id": "future", "home_team_spread": "-3.5"}],
            receipt,
        )
        self.assertEqual(
            self.conn.execute("SELECT is_pregame FROM football_markets").fetchone()[0],
            0,
        )

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

    def test_ncaa_player_rows_keep_game_context_without_identity_join(self):
        row = {
            "contest_id": "ncaa-contest",
            "espn_game_id": "game-123",
            "team_id": "8166431",
            "name": "Source Player",
            "category": "rushing",
            "rush_attempts": "4",
        }
        store_rows(self.conn, "ncaa_player_stats", 2025, [row], {"fetched_at": "2026-09-11T00:00:00Z"})
        stored = self.conn.execute(
            "SELECT athlete_id,team_id,game_id,category,stats_json FROM football_stats"
        ).fetchone()
        self.assertIsNone(stored[0])
        self.assertEqual(stored[1:4], ("8166431", "game-123", "rushing"))
        payload = json.loads(stored[4])
        self.assertEqual(payload["contest_id"], "ncaa-contest")
        self.assertEqual(payload["name"], "Source Player")


if __name__ == "__main__":
    unittest.main()


class SourcePolicyTests(unittest.TestCase):
    def test_legacy_scraper_obeys_robots_before_requesting_page(self):
        import tempfile
        from unittest.mock import Mock

        from ncaa_scraper.scraper import BaseScraper, NCAAFetchError

        response = Mock(status_code=200, text="User-agent: *\nDisallow: /\n")
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("ncaa_scraper.scraper.requests.Session.get", return_value=response) as get,
        ):
            with self.assertRaises(NCAAFetchError):
                BaseScraper(directory)._get_cached_or_fetch(
                    "https://stats.ncaa.org/contests/1", "contest"
                )
            self.assertEqual(get.call_count, 1)
            self.assertTrue(get.call_args.args[0].endswith("/robots.txt"))

    def test_legacy_scraper_does_not_retry_an_interstitial(self):
        import tempfile
        from unittest.mock import Mock

        from ncaa_scraper.scraper import BaseScraper, NCAAFetchError

        robots = Mock(status_code=200, text="User-agent: *\nAllow: /\n")
        page = Mock(status_code=200, text="akamai_validation")
        page.raise_for_status.return_value = None
        with (
            tempfile.TemporaryDirectory() as directory,
            patch(
                "ncaa_scraper.scraper.requests.Session.get",
                side_effect=[robots, page],
            ) as get,
        ):
            scraper = BaseScraper(directory)
            scraper.delay_seconds = 0
            with self.assertRaises(NCAAFetchError):
                scraper._get_cached_or_fetch(
                    "https://stats.ncaa.org/contests/1", "contest"
                )
            self.assertEqual(get.call_count, 2)

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
