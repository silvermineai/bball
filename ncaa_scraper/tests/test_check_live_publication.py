import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts.check_live_publication import (
    check_live,
    player_box_field_metadata,
    validate_recruiting_destinations,
    validate_reviewed_recruiting_release,
)


class LivePublicationCheckTest(unittest.TestCase):
    def test_accepts_complete_player_box_field_coverage(self):
        payload = {
            "fields": ["pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"],
            "seasons": [{
                "season": 2026,
                "rows": 10,
                "fields": {
                    field: {"observed": 10, "share": 1.0}
                    for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")
                },
            }],
        }
        self.assertEqual(player_box_field_metadata(payload), (9, 10, 9))

    def test_rejects_player_box_field_coverage_without_core_stat(self):
        with self.assertRaisesRegex(ValueError, "missing core stats"):
            player_box_field_metadata({
                "fields": ["pts", "mins"],
                "seasons": [{
                    "season": 2026,
                    "rows": 10,
                    "fields": {
                        "pts": {"observed": 10, "share": 1.0},
                        "mins": {"observed": 10, "share": 1.0},
                    },
                }],
            })

    def test_accepts_destination_mix_that_reconciles_to_total(self):
        validate_recruiting_destinations([
            {
                "team_id": "248",
                "team": "Houston Cougars",
                "total": 3,
                "ranked_total": 3,
                "top100_total": 2,
                "best_rank": 36,
                "average_rank": 49.5,
                "position_breakdown": [
                    {"position": "PG", "total": 2},
                    {"position": "C", "total": 1},
                ],
            },
        ])

    def test_rejects_destination_mix_that_does_not_reconcile(self):
        with self.assertRaisesRegex(ValueError, "does not reconcile"):
            validate_recruiting_destinations([
                {
                    "team_id": "248",
                    "team": "Houston Cougars",
                    "total": 3,
                    "ranked_total": 3,
                    "top100_total": 2,
                    "best_rank": 36,
                    "average_rank": 49.5,
                    "position_breakdown": [{"position": "PG", "total": 1}],
                },
            ])

    def test_rejects_non_numeric_destination_id(self):
        with self.assertRaisesRegex(ValueError, "summary is malformed"):
            validate_recruiting_destinations([
                {
                    "team_id": "houston",
                    "team": "Houston Cougars",
                    "total": 1,
                    "ranked_total": 1,
                    "top100_total": 1,
                    "best_rank": 1,
                    "average_rank": 1,
                    "position_breakdown": [{"position": "PG", "total": 1}],
                },
            ])

    def test_rejects_empty_reviewed_recruiting_release(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        with self.assertRaisesRegex(ValueError, "malformed or empty"):
            validate_reviewed_recruiting_release(
                {
                    "season": 2027,
                    "reviewed_at": "2026-09-10T18:00:00Z",
                    "coverage": {"programs": 0, "players": 0, "events": 0, "sources": 0},
                },
                now,
                240,
            )

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
            "/api/football/recruiting?meta=1": {
                "seasons": [2026, 2025],
                "datasets": [
                    {"dataset": dataset, "season": 2026, "rows": 10}
                    for dataset in ("rosters", "recruits", "team_talent", "returning_production")
                ],
                "receipts": [
                    {"dataset": dataset, "season": 2026, "fetched_at": "2026-09-10T18:00:00Z"}
                    for dataset in ("rosters", "recruits", "team_talent", "returning_production")
                ],
            },
            "/api/basketball/research/forecasts?meta=1": {
                "models": [{"model_id": "model-1", "target_season": 2027, "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/football/research/forecasts?meta=1": {
                "models": [{"model_id": "football-model-1", "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/research/scorecard?sport=basketball&season=2027&status=excluded&limit=1&publication_check=1": {
                "total": 1,
                "games": [{"model_id": "model-1"}],
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
                        "1": {"players": 1791, "apg": 1791, "ast": 1791, **{key: 1791 for key in ("ppg", "rpg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "orb", "drb", "pf", "o_poss", "tpm", "tpa", "mins")}},
                        "2": {"players": 1020, "apg": 0},
                        "3": {"players": 1031, "apg": 0},
                    },
                },
            },
            "/data/basketball/ncaa-player-box-fields.json": {
                "fields": ["pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"],
                "seasons": [{"season": 2026, "rows": 100, "fields": {field: {"observed": 100, "share": 1.0} for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")}}],
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting-rankings?season=2026&page=0&publication_check=1": {"season": 2026, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2027&page=0&publication_check=1": {"season": 2027, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2028&page=0&publication_check=1": {"season": 2028, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2029&page=0&publication_check=1": {"season": 2029, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2030&page=0&publication_check=1": {"season": 2030, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting?season=2027&publication_check=1": {
                "season": 2027,
                "reviewed_at": "2026-09-10T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
                "sources": [{"source_sha256": "a" * 64} for _ in range(44)],
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
            "/api/research/briefs?sport=all&page=0": {
                "total": 2323,
                "rows": [{"sport": "basketball", "game_id": "401902275", "revision": "d25ebd383e9b591503777f3fde5bce62e972e57bc0f85f4ae363afda79739f32"}],
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            report = check_live("https://example.test", now=now)
        self.assertEqual(report["forecast_model"], "model-1")
        self.assertEqual(report["recruiting_intake_rows"], 0)
        self.assertEqual(report["recruiting_reviewed_players"], 96)
        self.assertEqual(report["recruiting_reviewed_age_hours"], 2.0)
        self.assertEqual(report["recruiting_prospect_destination_groups"], {"2026": 1, "2027": 1, "2028": 1, "2029": 1, "2030": 1})
        self.assertEqual(report["football_source_max_age_hours"], 2.0)
        self.assertEqual(report["football_personnel_rows"], 40)
        self.assertEqual(report["football_personnel_source_max_age_hours"], 2.0)
        self.assertEqual(report["football_forecast_rows"], 100)
        self.assertEqual(report["basketball_player_identified_rows"], 196865)
        self.assertEqual(report["basketball_player_team_entries"], 9990)
        self.assertEqual(report["ncaa_d1_apg_values"], 1791)
        self.assertEqual(report["ncaa_d1_ast_values"], 1791)
        self.assertEqual(report["ncaa_box_field_count"], 9)
        self.assertEqual(report["ncaa_box_latest_rows"], 100)
        self.assertEqual(report["ncaa_box_observed_fields"], 9)
        self.assertEqual(report["news_archive_total"], 83)
        self.assertEqual(report["news_latest_seen_age_hours"], 1.0)
        self.assertEqual(report["basketball_market_observations"], 0)
        self.assertEqual(report["basketball_market_pregame"], 0)
        self.assertEqual(report["football_market_observations"], 12)
        self.assertEqual(report["football_market_pregame"], 12)
        self.assertEqual(report["brief_archive_total"], 2323)
        self.assertEqual(report["brief_archive_page_rows"], 1)

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
            "/api/football/recruiting?meta=1": {
                "seasons": [2026],
                "datasets": [
                    {"dataset": dataset, "season": 2026, "rows": 10}
                    for dataset in ("rosters", "recruits", "team_talent", "returning_production")
                ],
                "receipts": [
                    {"dataset": dataset, "season": 2026, "fetched_at": "2026-09-10T18:00:00Z"}
                    for dataset in ("rosters", "recruits", "team_talent", "returning_production")
                ],
            },
            "/api/basketball/research/forecasts?meta=1": {
                "models": [{"model_id": "model-1", "target_season": 2027, "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/football/research/forecasts?meta=1": {
                "models": [{"model_id": "football-model-1", "forecasts": 100, "last_created_at": "2026-09-10T18:00:00Z"}],
            },
            "/api/research/scorecard?sport=basketball&season=2027&status=excluded&limit=1&publication_check=1": {
                "total": 1,
                "games": [{"model_id": "model-1"}],
            },
            "/api/basketball/research/careers/meta": {
                "seasons": [{"season": 2026, "identified_rows": 196865, "player_team_entries": 9990}],
                "latest_receipt": "2026-09-10T18:00:00Z",
            },
            "/api/basketball/research/ncaa-leaders?meta=1": {
                "season": 2026,
                "coverage": {"players": 3842, "divisions": {
                    "1": {"players": 1791, "apg": 1791, "ast": 1791, **{key: 1791 for key in ("ppg", "rpg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "orb", "drb", "pf", "o_poss", "tpm", "tpa", "mins")}},
                    "2": {"players": 1020, "apg": 0},
                    "3": {"players": 1031, "apg": 0},
                }},
            },
            "/data/basketball/ncaa-player-box-fields.json": {
                "fields": ["pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"],
                "seasons": [{"season": 2026, "rows": 100, "fields": {field: {"observed": 100, "share": 1.0} for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")}}],
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting-rankings?season=2026&page=0&publication_check=1": {"season": 2026, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2027&page=0&publication_check=1": {"season": 2027, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2028&page=0&publication_check=1": {"season": 2028, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2029&page=0&publication_check=1": {"season": 2029, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2030&page=0&publication_check=1": {"season": 2030, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting?season=2027&publication_check=1": {
                "season": 2027,
                "reviewed_at": "2026-09-10T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
                "sources": [{"source_sha256": "a" * 64} for _ in range(44)],
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
            "/api/football/recruiting?meta=1": {
                "seasons": [2026],
                "datasets": [
                    {"dataset": dataset, "season": 2026, "rows": 10}
                    for dataset in ("rosters", "recruits", "team_talent", "returning_production")
                ],
                "receipts": [
                    {"dataset": dataset, "season": 2026, "fetched_at": "2026-09-10T18:00:00Z"}
                    for dataset in ("rosters", "recruits", "team_talent", "returning_production")
                ],
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
                    "1": {"players": 1791, "apg": 1791, "ast": 1791, **{key: 1791 for key in ("ppg", "rpg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "orb", "drb", "pf", "o_poss", "tpm", "tpa", "mins")}},
                    "2": {"players": 1020, "apg": 0},
                    "3": {"players": 1031, "apg": 0},
                }},
            },
            "/data/basketball/ncaa-player-box-fields.json": {
                "fields": ["pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"],
                "seasons": [{"season": 2026, "rows": 100, "fields": {field: {"observed": 100, "share": 1.0} for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")}}],
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting?season=2027&publication_check=1": {
                "season": 2027,
                "reviewed_at": "2026-08-01T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
            },
            "/api/research/scorecard?sport=basketball&season=2027&status=excluded&limit=1&publication_check=1": {
                "total": 0,
                "games": [],
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=lambda _base, path: responses[path]):
            with self.assertRaisesRegex(ValueError, "reviewed recruiting release"):
                check_live("https://example.test", now=now)


if __name__ == "__main__":
    unittest.main()
