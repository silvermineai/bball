import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts.check_live_publication import check_live


class LivePublicationCheckTest(unittest.TestCase):
    def test_checks_both_sports_forecast_clock_and_recruiting_shape(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "location_validation": {},
                "possession_validation": {},
            },
            "/api/football/coverage": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/basketball/research/forecasts?meta=1": {
                "models": [{"model_id": "model-1", "target_season": 2027, "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/football/research/forecasts?meta=1": {
                "models": [{"model_id": "football-model-1", "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/basketball/research/careers/meta": {
                "seasons": [{"season": 2026, "identified_rows": 196865, "player_team_entries": 9990}],
                "latest_receipt": "2026-09-10T18:00:00Z",
            },
            "/api/basketball/research/ncaa-leaders?meta=1": {
                "season": 2026,
                "coverage": {
                    "players": 3842,
                    "divisions": {
                        "1": {"players": 1791, "apg": 1791, "ast": 1791, **{key: 1791 for key in ("ppg", "rpg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "pts", "reb", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta")}},
                        "2": {"players": 1020, "apg": 0},
                        "3": {"players": 1031, "apg": 0},
                    },
                },
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting?season=2027": {
                "season": 2027,
                "reviewed_at": "2026-09-10T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
            },
            "/api/basketball/research/news?meta=1": {
                "summary": {"total": 83, "latest_published": "2026-09-10T19:00:00Z", "latest_seen_at": "2026-09-10T19:00:00Z"},
                "releases": [{"article_count": 76}],
            },
            "/api/research/markets?meta=1&sport=basketball": {
                "sport": "basketball",
                "total": 0,
                "pregame": 0,
                "provider_capabilities": [{
                    "provider": "The Odds API",
                    "markets": ["h2h", "spreads", "totals"],
                    "provider_update_clock": True,
                }],
            },
            "/api/research/markets?meta=1&sport=football": {
                "sport": "football",
                "total": 12,
                "pregame": 12,
                "provider_capabilities": [{
                    "provider": "The Odds API",
                    "markets": ["h2h", "spreads", "totals"],
                    "provider_update_clock": True,
                }],
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            report = check_live("https://example.test", now=now)
        self.assertEqual(report["forecast_model"], "model-1")
        self.assertEqual(report["recruiting_intake_rows"], 0)
        self.assertEqual(report["recruiting_reviewed_players"], 96)
        self.assertEqual(report["recruiting_reviewed_age_hours"], 2.0)
        self.assertEqual(report["football_source_max_age_hours"], 2.0)
        self.assertEqual(report["football_forecast_rows"], 100)
        self.assertEqual(report["basketball_player_identified_rows"], 196865)
        self.assertEqual(report["basketball_player_team_entries"], 9990)
        self.assertEqual(report["ncaa_d1_apg_values"], 1791)
        self.assertEqual(report["ncaa_d1_ast_values"], 1791)
        self.assertEqual(report["news_archive_total"], 83)
        self.assertEqual(report["news_latest_seen_age_hours"], 1.0)
        self.assertEqual(report["basketball_market_observations"], 0)
        self.assertEqual(report["basketball_market_pregame"], 0)
        self.assertEqual(report["football_market_observations"], 12)
        self.assertEqual(report["football_market_pregame"], 12)

    def test_rejects_malformed_market_metadata(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "location_validation": {},
                "possession_validation": {},
            },
            "/api/football/coverage": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/basketball/research/forecasts?meta=1": {
                "models": [{"model_id": "model-1", "target_season": 2027, "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/football/research/forecasts?meta=1": {
                "models": [{"model_id": "football-model-1", "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/basketball/research/careers/meta": {
                "seasons": [{"season": 2026, "identified_rows": 196865, "player_team_entries": 9990}],
                "latest_receipt": "2026-09-10T18:00:00Z",
            },
            "/api/basketball/research/ncaa-leaders?meta=1": {
                "season": 2026,
                "coverage": {"players": 3842, "divisions": {
                    "1": {"players": 1791, "apg": 1791, "ast": 1791, **{key: 1791 for key in ("ppg", "rpg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "pts", "reb", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta")}},
                    "2": {"players": 1020, "apg": 0},
                    "3": {"players": 1031, "apg": 0},
                }},
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting?season=2027": {
                "season": 2027,
                "reviewed_at": "2026-09-10T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
            },
            "/api/basketball/research/news?meta=1": {
                "summary": {"total": 83, "latest_published": "2026-09-10T19:00:00Z", "latest_seen_at": "2026-09-10T19:00:00Z"},
                "releases": [{"article_count": 76}],
            },
            "/api/research/markets?meta=1&sport=basketball": {
                "sport": "basketball", "total": 1, "pregame": 2, "provider_capabilities": [],
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            with self.assertRaisesRegex(ValueError, "basketball market archive metadata"):
                check_live("https://example.test", now=now)

    def test_rejects_stale_basketball_source(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-08-01T18:00:00Z"}],
                "location_validation": {},
                "possession_validation": {},
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            with self.assertRaisesRegex(ValueError, "source games"):
                check_live("https://example.test", now=now)

    def test_rejects_stale_football_source(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "location_validation": {},
                "possession_validation": {},
            },
            "/api/football/coverage": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-08-01T18:00:00Z"}],
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            with self.assertRaisesRegex(ValueError, "football source games"):
                check_live("https://example.test", now=now)

    def test_rejects_stale_reviewed_recruiting_release(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "location_validation": {},
                "possession_validation": {},
            },
            "/api/football/coverage": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/basketball/research/forecasts?meta=1": {
                "models": [{"model_id": "model-1", "target_season": 2027, "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/football/research/forecasts?meta=1": {
                "models": [{"model_id": "football-model-1", "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/basketball/research/careers/meta": {
                "seasons": [{"season": 2026, "identified_rows": 196865, "player_team_entries": 9990}],
                "latest_receipt": "2026-09-10T18:00:00Z",
            },
            "/api/basketball/research/ncaa-leaders?meta=1": {
                "season": 2026,
                "coverage": {"players": 3842, "divisions": {
                    "1": {"players": 1791, "apg": 1791, "ast": 1791, **{key: 1791 for key in ("ppg", "rpg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "pts", "reb", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta")}},
                    "2": {"players": 1020, "apg": 0},
                    "3": {"players": 1031, "apg": 0},
                }},
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting?season=2027": {
                "season": 2027,
                "reviewed_at": "2026-08-01T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            with self.assertRaisesRegex(ValueError, "reviewed recruiting release"):
                check_live("https://example.test", now=now)


if __name__ == "__main__":
    unittest.main()
