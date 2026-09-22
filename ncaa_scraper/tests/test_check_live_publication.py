import re
import socket
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.check_live_publication import (
    DAILY_PUBLICATION_MAX_AGE_HOURS,
    check_live,
    forecast_coverage,
    validate_forecast_prediction,
    validate_forecast_matchup_context,
    roster_forecast_alignment,
    market_metadata,
    validate_market_capture,
    matchup_personnel_coverage,
    player_box_field_metadata,
    receipt_ages,
    womens_forecast_metadata,
    womens_lower_division_metadata,
    womens_lower_schedule_archive_metadata,
    womens_lower_ratings_metadata,
    mens_lower_ratings_metadata,
    lower_division_target_probe_metadata,
    mens_lower_schedule_archive_metadata,
    validate_recruiting_destinations,
    validate_coverage_audit,
    validate_reviewed_recruiting_release,
    football_personnel_readiness_metadata,
    get_json,
)


class LivePublicationCheckTest(unittest.TestCase):
    def test_final_national_snapshot_keeps_its_real_clock_without_aging_active_feeds(self):
        now = datetime(2026, 9, 22, 20, tzinfo=timezone.utc)
        ages = receipt_ages({
            "source_receipts": [
                {"dataset": "games", "latest_source_at": "2026-09-22T18:00:00Z"},
                {"dataset": "ncaa_individual", "latest_source_at": "2026-06-01T18:00:00Z"},
            ],
        }, "basketball", now, 72, archival_datasets={"ncaa_individual"})
        self.assertEqual(ages, [2.0])

    @staticmethod
    def womens_lower_schedule_payload():
        return {
            "schema_version": 1,
            "source": {
                "publisher": "NCAA.com",
                "season_year": 2025,
                "identity_limit": "Contest IDs and publisher team slugs are retained.",
            },
            "calendar": [{"sport": "basketball", "gender": "women", "division": 2, "contest_date": "03/01/2026", "count": 1}],
            "contests": [{
                "sport": "basketball",
                "gender": "women",
                "division": 2,
                "contest_id": 123,
                "teams": [
                    {"name": "Alpha", "slug": "alpha"},
                    {"name": "Beta", "slug": None},
                ],
            }],
            "receipts": [{
                "url": "https://sdataprod.ncaa.com?meta=GetContests_web",
                "status": 200,
                "sha256": "a" * 64,
                "bytes": 100,
            }],
        }

    @staticmethod
    def mens_lower_schedule_payload():
        payload = LivePublicationCheckTest.womens_lower_schedule_payload()
        payload["calendar"][0]["gender"] = "men"
        payload["contests"][0]["gender"] = "men"
        return payload

    def test_womens_lower_schedule_metadata_validates_scope_receipts_and_null_slugs(self):
        payload = self.womens_lower_schedule_payload()
        summary = womens_lower_schedule_archive_metadata(payload)
        self.assertEqual(summary["season_year"], 2025)
        self.assertEqual(summary["d2_contests"], 1)
        payload["contests"][0]["gender"] = "men"
        with self.assertRaisesRegex(ValueError, "contest is malformed"):
            womens_lower_schedule_archive_metadata(payload)

    def test_mens_lower_schedule_metadata_validates_exact_scope(self):
        payload = self.womens_lower_schedule_payload()
        payload["calendar"][0]["gender"] = "men"
        payload["contests"][0]["gender"] = "men"
        summary = mens_lower_schedule_archive_metadata(payload)
        self.assertEqual(summary["season_year"], 2025)
        self.assertEqual(summary["d2_contests"], 1)
        payload["contests"][0]["gender"] = "women"
        with self.assertRaisesRegex(ValueError, "contest is malformed"):
            mens_lower_schedule_archive_metadata(payload)

    @staticmethod
    def womens_lower_ratings_payload():
        divisions = {}
        for division in (2, 3):
            key = f"d{division}"
            divisions[key] = {
                "division": division,
                "model_id": f"wbb-lower-ratings-v1-{key}-" + "a" * 12,
                "model_status": "research_only",
                "forecast_status": "not_published",
                "coverage": {"valid_final_games": 100, "teams": 1, "source_receipts": 2, "excluded": {}},
                "ratings": [{"rank": 1, "team_id": f"team-{division}", "team": "Example", "games": 100}],
                "target_schedule": {"season": 2027, "status": "missing", "games": 0, "note": "No target schedule."},
                "source": {"schedule_asset_sha256": "b" * 64, "receipt_count": 2, "receipt_digest": "c" * 64},
            }
        return {
            "schema_version": 1,
            "sport": "basketball",
            "gender": "women",
            "target_season": 2027,
            "model_status": "research_only",
            "forecast_status": "not_published",
            "generated_at": "2026-09-10T18:00:00Z",
            "divisions": divisions,
        }

    def test_womens_lower_ratings_metadata_requires_research_gate_and_exact_ranks(self):
        payload = self.womens_lower_ratings_payload()
        summary = womens_lower_ratings_metadata(payload)
        self.assertEqual(summary["d2"]["valid_final_games"], 100)
        self.assertEqual(summary["d3"]["teams"], 1)
        payload["divisions"]["d2"]["target_schedule"]["status"] = "ready"
        with self.assertRaisesRegex(ValueError, "forecast gate"):
            womens_lower_ratings_metadata(payload)

    @staticmethod
    def mens_lower_ratings_payload():
        payload = LivePublicationCheckTest.womens_lower_ratings_payload()
        payload["gender"] = "men"
        for division in ("d2", "d3"):
            payload["divisions"][division]["model_id"] = f"mbb-lower-ratings-v1-{division}-" + "a" * 12
        return payload

    def test_mens_lower_ratings_metadata_requires_its_own_model_namespace(self):
        payload = self.womens_lower_ratings_payload()
        payload["gender"] = "men"
        for division in ("d2", "d3"):
            payload["divisions"][division]["model_id"] = f"mbb-lower-ratings-v1-{division}-" + "a" * 12
        summary = mens_lower_ratings_metadata(payload)
        self.assertEqual(summary["d2"]["model_id"], "mbb-lower-ratings-v1-d2-" + "a" * 12)
        payload["divisions"]["d2"]["model_id"] = "wbb-lower-ratings-v1-d2-" + "a" * 12
        with self.assertRaisesRegex(ValueError, "scope is malformed"):
            mens_lower_ratings_metadata(payload)

    @staticmethod
    def lower_target_probe_payload(sport_code="WBB"):
        return {
            "schema_version": 1,
            "generated_at": "2026-09-10T18:00:00Z",
            "target_season": "2026-27",
            "requested_months": [9, 10, 11],
            "source": {
                "publisher": "NCAA.com",
                "season_year": 2026,
                "method": f"Persisted NCAA scoreboard queries with sportCode={sport_code} and explicit division.",
                "query_contract": {"schedule": {"sha256": "a" * 64}},
                "identity_limit": "No name-only join is performed.",
            },
            "calendar": [],
            "contests": [],
            "receipts": [{
                "url": "https://sdataprod.ncaa.com?query=probe",
                "status": 200,
                "sha256": "a" * 64,
                "bytes": 28,
            }],
        }

    def test_target_probe_requires_exact_scope_and_fresh_receipts(self):
        summary = lower_division_target_probe_metadata(
            self.lower_target_probe_payload(),
            "WBB",
            datetime(2026, 9, 10, 20, tzinfo=timezone.utc),
            36,
        )
        self.assertEqual(summary["contests"], 0)
        payload = self.lower_target_probe_payload("MBB")
        with self.assertRaisesRegex(ValueError, "source contract"):
            lower_division_target_probe_metadata(payload, "WBB", datetime(2026, 9, 10, 20, tzinfo=timezone.utc), 36)

    @staticmethod
    def womens_lower_division_payload():
        divisions = {}
        for division in (2, 3):
            key = f"d{division}"
            divisions[key] = {
                "source_scope": {"sport": "basketball", "gender": "women", "division": division},
                "identity_status": "source_names_and_team_slugs_only",
                "identity_note": "No athlete ID is published.",
                "individual": [{
                    "source_url": f"https://www.ncaa.com/stats/basketball-women/{key}/current/individual/1009",
                    "headers": ["Rank", "Name"],
                    "rows": [{"rank": 1, "name": "Example"}],
                }],
                "team": [{
                    "source_url": f"https://www.ncaa.com/stats/basketball-women/{key}/current/team/1002",
                    "headers": ["Rank", "Team"],
                    "rows": [{"rank": 1, "team": "Example"}],
                }],
            }
        return {
            "schema_version": 1,
            "generated_at": "2026-09-10T18:00:00Z",
            "source": {"publisher": "NCAA.com", "limitation": "No stable athlete ID is published."},
            "receipts": [{
                "url": "https://www.ncaa.com/stats/basketball-women/d2",
                "status": 200,
                "sha256": "a" * 64,
                "bytes": 100,
            }],
            "divisions": divisions,
        }

    def test_womens_lower_division_metadata_requires_explicit_scope_and_identity_boundary(self):
        payload = self.womens_lower_division_payload()
        summary = womens_lower_division_metadata(payload, datetime(2026, 9, 10, 20, tzinfo=timezone.utc), 36)
        self.assertEqual(summary["receipt_count"], 1)
        self.assertEqual(summary["d2"]["individual_rows"], 1)
        payload["divisions"]["d3"]["individual"][0]["rows"][0]["athlete_id"] = "unsafe"
        with self.assertRaisesRegex(ValueError, "unsafe identity"):
            womens_lower_division_metadata(payload, datetime(2026, 9, 10, 20, tzinfo=timezone.utc), 36)

    def test_daily_monitor_requires_complete_warehouse_audit(self):
        complete = {
            "audit_status": "complete",
            "location_validation": {},
            "possession_validation": {},
        }
        self.assertEqual(validate_coverage_audit(complete), ({}, {}))
        with self.assertRaisesRegex(ValueError, "coverage audit is partial"):
            validate_coverage_audit({
                "audit_status": "partial",
                "location_validation": {},
                "possession_validation": None,
            })
        with self.assertRaisesRegex(ValueError, "incomplete validation results"):
            validate_coverage_audit({
                "audit_status": "complete",
                "location_validation": {},
                "possession_validation": None,
            })

    def test_daily_monitor_freshness_window_catches_second_missed_refresh(self):
        self.assertEqual(DAILY_PUBLICATION_MAX_AGE_HOURS, 36)

    def test_forecast_coverage_requires_exact_upcoming_denominator(self):
        self.assertEqual(forecast_coverage({"season": 2027, "status": "upcoming", "total": 12}, 2027, 12), 12)
        with self.assertRaisesRegex(ValueError, "every upcoming game"):
            forecast_coverage({"season": 2027, "status": "upcoming", "total": 11}, 2027, 12)

    def test_forecast_prediction_requires_reconciled_efficiency_fields(self):
        row = {
            "prediction_integrity": "valid",
            "prediction": {
                "home_score": 80,
                "away_score": 64,
                "home_margin": 16,
                "total": 144,
                "pace": 70,
                "home_win_probability": 0.8,
                "margin_low": 2,
                "margin_high": 30,
                "home_efficiency": 114.29,
                "away_efficiency": 91.43,
                "estimate_type": "primary",
            },
        }
        self.assertEqual(validate_forecast_prediction(row), {"estimate_type": "primary", "pace": 70.0})
        row["prediction"]["away_efficiency"] = 89
        with self.assertRaisesRegex(ValueError, "away efficiency"):
            validate_forecast_prediction(row)

    def test_forecast_matchup_context_reports_exact_and_older_editions(self):
        exact = {
            "matchup_factors_integrity": "valid",
            "matchup_factors_source": "forecast_payload",
            "matchup_factors_model_id": "model-current",
            "matchup_factors_same_edition": True,
            "matchup_factors": {"season": 2026},
        }
        self.assertEqual(
            validate_forecast_matchup_context(exact, "model-current"),
            {
                "integrity": "valid",
                "source": "forecast_payload",
                "model_id": "model-current",
                "same_edition": True,
            },
        )
        older = {**exact, "matchup_factors_source": "published_asset", "matchup_factors_model_id": "model-old", "matchup_factors_same_edition": False}
        self.assertEqual(validate_forecast_matchup_context(older, "model-current")["same_edition"], False)

    def test_forecast_matchup_context_rejects_inconsistent_provenance(self):
        with self.assertRaisesRegex(ValueError, "edition flag"):
            validate_forecast_matchup_context({
                "matchup_factors_integrity": "valid",
                "matchup_factors_source": "published_asset",
                "matchup_factors_model_id": "model-old",
                "matchup_factors_same_edition": True,
                "matchup_factors": {},
            }, "model-current")
        self.assertEqual(
            validate_forecast_matchup_context({"matchup_factors_integrity": "unavailable"}, "model-current")["same_edition"],
            None,
        )

    @staticmethod
    def womens_forecast_payload():
        return {
            "model_id": "womens-model-1",
            "sport": "basketball",
            "gender": "women",
            "target_season": 2027,
            "generated_at": "2026-09-10T18:00:00Z",
            "model_status": "published",
            "validation_season": 2026,
            "validation": {
                "games": 50,
                "margin_mae": 14.2,
                "win_accuracy": 0.69,
                "brier_score": 0.20,
                "log_loss": 0.59,
                "interval_games": 50,
                "interval_coverage": 0.73,
            },
            "calibration": {
                "games": 100,
                "logistic_coefficients": [-0.6, 0.15],
                "margin_half_width": 19.2,
                "interval_games": 100,
                "interval_target": 0.8,
                "evaluated_season": 2026,
                "brier": 0.2,
                "log_loss": 0.59,
            },
            "coverage": {"forecast_rows": 1, "primary_rows": 1, "cold_start_rows": 0, "rated_teams": 2},
            "forecasts": [{
                "game_id": "401902275",
                "home_id": "1",
                "away_id": "2",
                "prediction": {
                    "home_win_probability": 0.7,
                    "away_win_probability": 0.3,
                    "predicted_margin": 5.5,
                    "predicted_home_score": 70,
                    "predicted_away_score": 64.5,
                    "estimate_type": "primary",
                    "margin_low": -13.7,
                    "margin_high": 24.7,
                },
            }],
        }

    def test_womens_forecast_requires_published_scope_and_evidence(self):
        payload = self.womens_forecast_payload()
        self.assertEqual(
            womens_forecast_metadata(payload),
            {
                "model_id": "womens-model-1",
                "forecast_rows": 1,
                "primary_rows": 1,
                "cold_start_rows": 0,
                "validation_games": 50,
                "calibration_games": 100,
            },
        )
        payload["gender"] = "men"
        with self.assertRaisesRegex(ValueError, "wrong scope or status"):
            womens_forecast_metadata(payload)
        payload = self.womens_forecast_payload()
        payload["forecasts"][0]["prediction"]["home_win_probability"] = 1.2
        with self.assertRaisesRegex(ValueError, "home win probability"):
            womens_forecast_metadata(payload)

    def test_womens_forecast_v4_requires_reconcilable_adjusted_units(self):
        payload = self.womens_forecast_payload()
        payload["model_id"] = "womens-basketball-opponent-adjusted-v4-test"
        payload["forecasts"][0]["prediction"]["model_inputs"] = {
            "home_adjusted_offense": 70,
            "home_adjusted_defense": 68,
            "away_adjusted_offense": 64.5,
            "away_adjusted_defense": 68,
            "home_adjusted_net": 2,
            "away_adjusted_net": -3.5,
            "neutral_court_edge": 5.5,
            "home_court_adjustment": 0,
            "league_average_points": 68,
        }
        self.assertEqual(womens_forecast_metadata(payload)["forecast_rows"], 1)
        payload["forecasts"][0]["prediction"]["model_inputs"]["neutral_court_edge"] = 10
        with self.assertRaisesRegex(ValueError, "adjusted units do not reconcile"):
            womens_forecast_metadata(payload)

    def test_womens_forecast_rejects_score_margin_disagreement(self):
        payload = self.womens_forecast_payload()
        payload["forecasts"][0]["prediction"]["predicted_home_score"] = 80
        with self.assertRaisesRegex(ValueError, "scores do not reconcile"):
            womens_forecast_metadata(payload)

    def test_roster_challenger_requires_the_exact_forecast_edition(self):
        payload = {
            "roster_model": {"primary_model_id": "model-1", "scenario_games": 90},
            "roster_alignment": {
                "resolved_model_id": "model-1",
                "roster_primary_model_id": "model-1",
                "compatible": True,
                "status": "matched",
            },
        }
        self.assertEqual(roster_forecast_alignment(payload, "model-1"), 90)
        payload["roster_alignment"] = {**payload["roster_alignment"], "compatible": False, "status": "model_mismatch"}
        with self.assertRaisesRegex(ValueError, "not aligned"):
            roster_forecast_alignment(payload, "model-1")

    @staticmethod
    def matchup_personnel_payload():
        stats = {"ppg": 12.1, "rpg": None, "apg": 3.4}
        player = {
            "team_id": "1", "athlete_id": "10", "name": "Example Guard", "status": "returning",
            "prior_minutes": 800, "prior_stints": [{"team_id": "1", "stats": stats, "box_bpm": 2.5}],
        }
        empty_player = {
            "team_id": "2", "athlete_id": "20", "name": "Example Wing", "status": "new_to_dataset",
            "prior_minutes": None, "prior_stints": [],
        }
        return {
            "season": 2027, "prior_season": 2026,
            "game": {"id": "401902275", "home_id": "1", "away_id": "2"},
            "coverage": {"listed_players": 2, "players_with_prior_minutes": 1, "players_with_publisher_stats": 1, "players_with_box_bpm": 1},
            "home": {"team_id": "1", "listed_players": 1, "returning_players": 1, "incoming_players": 0, "new_to_dataset_players": 0, "ambiguous_players": 0, "players_with_prior_minutes": 1, "players_with_publisher_stats": 1, "players_with_box_bpm": 1, "players": [player]},
            "away": {"team_id": "2", "listed_players": 1, "returning_players": 0, "incoming_players": 0, "new_to_dataset_players": 1, "ambiguous_players": 0, "players_with_prior_minutes": 0, "players_with_publisher_stats": 0, "players_with_box_bpm": 0, "players": [empty_player]},
            "source_receipts": [{"dataset": "rosters", "season": 2027, "fetched_at": "2026-09-10T18:00:00Z", "sha256": "a" * 64}],
            "identity_policy": "Exact source athlete IDs.",
        }

    def test_matchup_personnel_reconciles_exact_forecast_and_roster_evidence(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        forecast = {"season": 2027, "game_id": "401902275", "home_id": "1", "away_id": "2"}
        self.assertEqual(
            matchup_personnel_coverage(self.matchup_personnel_payload(), forecast, now, 36),
            {"listed_players": 2, "players_with_prior_minutes": 1, "players_with_publisher_stats": 1, "players_with_box_bpm": 1, "source_receipts": 1, "source_max_age_hours": 2.0},
        )

    def test_matchup_personnel_rejects_mismatched_or_inconsistent_evidence(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        forecast = {"season": 2027, "game_id": "401902275", "home_id": "1", "away_id": "2"}
        wrong_game = self.matchup_personnel_payload()
        wrong_game["game"]["id"] = "999"
        with self.assertRaisesRegex(ValueError, "identity is malformed"):
            matchup_personnel_coverage(wrong_game, forecast, now, 36)
        inconsistent = self.matchup_personnel_payload()
        inconsistent["coverage"]["players_with_prior_minutes"] = 0
        with self.assertRaisesRegex(ValueError, "total coverage does not reconcile"):
            matchup_personnel_coverage(inconsistent, forecast, now, 36)

    def test_get_json_honors_retry_after_for_transient_http_errors(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            @staticmethod
            def read():
                return b'{"ok": true}'

        transient = HTTPError("https://example.test/data", 503, "busy", {"Retry-After": "0"}, None)
        with patch("scripts.check_live_publication.urlopen", side_effect=[transient, Response()]), patch(
            "scripts.check_live_publication.time.sleep"
        ) as sleep:
            self.assertEqual(get_json("https://example.test", "/data"), {"ok": True})
        sleep.assert_called_once_with(0.0)

    def test_get_json_retries_socket_read_timeouts(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            @staticmethod
            def read():
                return b'{"ok": true}'

        with patch("scripts.check_live_publication.urlopen", side_effect=[socket.timeout("slow read"), Response()]), patch(
            "scripts.check_live_publication.time.sleep"
        ) as sleep:
            self.assertEqual(get_json("https://example.test", "/data"), {"ok": True})
        sleep.assert_called_once_with(1.0)

    @staticmethod
    def response_for(responses):
        """Allow the production cache-busting probe key in fixture lookups."""
        def lookup(_base, path):
            canonical = re.sub(r"publication_check=\d+", "publication_check=1", path)
            if path.startswith("/api/basketball/research/coverage?"):
                return responses.get("/api/basketball/research/coverage?audit=1", {})
            if path.startswith("/api/basketball/research/schedule-times?"):
                value = responses.get("/api/basketball/research/schedule-times?season=2027&meta=1&publication_check=1", {
                    "season": 2027,
                    "total": 1,
                    "confirmed": 1,
                    "latest_observed_at": "2026-09-10T18:00:00Z",
                    "provider": "ESPN Scoreboard",
                })
                return {**value, "latest_observed_at": value.get("latest_observed_at", "2026-09-10T18:00:00Z")}
            if path.startswith("/api/basketball/research/forecasts?season=2027&status=upcoming&"):
                model = responses.get("/api/basketball/research/forecasts?meta=1", {}).get("models", [{}])[0]
                model_id = model.get("model_id")
                return {
                    "season": 2027,
                    "status": "upcoming",
                    "total": model.get("forecasts", 0),
                    "model": model_id,
                    "roster_model": {"primary_model_id": model_id, "scenario_games": max(1, model.get("forecasts", 0))},
                    "roster_alignment": {
                        "resolved_model_id": model_id,
                        "roster_primary_model_id": model_id,
                        "compatible": True,
                        "status": "matched",
                        "matched_rows": 0,
                    },
                    "rows": [{
                        "season": 2027,
                        "game_id": "401902275",
                        "home_id": "1",
                        "away_id": "2",
                        "prediction_integrity": "valid",
                        "prediction": {
                            "home_score": 80,
                            "away_score": 64,
                            "home_margin": 16,
                            "total": 144,
                            "pace": 70,
                            "home_win_probability": 0.8,
                            "margin_low": 2,
                            "margin_high": 30,
                            "home_efficiency": 114.29,
                            "away_efficiency": 91.43,
                            "estimate_type": "primary",
                        },
                        # The monitor now probes matchup-factor provenance
                        # separately from the roster challenger.  Keep the
                        # shared fixture explicit about an unavailable factor
                        # asset so tests exercise later checks instead of
                        # failing on an omitted field.
                        "matchup_factors_integrity": "unavailable",
                        "matchup_factors": None,
                        "matchup_factors_source": None,
                        "matchup_factors_model_id": None,
                        "matchup_factors_same_edition": None,
                    }],
                }
            if path.startswith("/api/basketball/research/matchup-personnel?"):
                return LivePublicationCheckTest.matchup_personnel_payload()
            if path == "/data/basketball/womens-forecast.json":
                return LivePublicationCheckTest.womens_forecast_payload()
            if path == "/data/basketball/womens-lower-division-stats.json":
                return LivePublicationCheckTest.womens_lower_division_payload()
            if path == "/data/basketball/womens-lower-division-schedules.json":
                return LivePublicationCheckTest.womens_lower_schedule_payload()
            if path == "/data/basketball/womens-lower-division-ratings.json":
                return LivePublicationCheckTest.womens_lower_ratings_payload()
            if path == "/data/basketball/mens-lower-division-ratings.json":
                return LivePublicationCheckTest.mens_lower_ratings_payload()
            if path == "/data/basketball/womens-lower-division-target-probe.json":
                return LivePublicationCheckTest.lower_target_probe_payload("WBB")
            if path == "/data/basketball/mens-lower-division-schedules.json":
                return LivePublicationCheckTest.mens_lower_schedule_payload()
            if path == "/data/basketball/mens-lower-division-target-probe.json":
                return LivePublicationCheckTest.lower_target_probe_payload("MBB")
            if path == "/data/football/personnel-readiness-2026.json":
                fields = ["talent_composite", "talent_rank", "blue_chip_ratio", "off_returning", "def_returning", "overall_returning"]
                side = lambda team_id: {
                    "team_id": team_id,
                    "team": None,
                    "available_fields": fields,
                    "source_datasets": ["team_talent", "returning_production"],
                    "conflicting_fields": [],
                }
                return {
                    "version": "football-personnel-readiness-v1",
                    "generated_at": "2026-09-10T19:00:00Z",
                    "target_season": 2026,
                    "primary_model_id": "football-model-1",
                    "coverage": {
                        "forecast_games": 1,
                        "team_sides": 2,
                        "complete_games": 1,
                        "partial_games": 0,
                        "conflict_games": 0,
                        "unavailable_games": 0,
                        "field_side_counts": {field: 2 for field in fields},
                        "personnel_teams": 2,
                    },
                    "feature_fields": fields,
                    "source_receipts": [
                        {"dataset": "team_talent", "season": 2026, "fetched_at": "2026-09-10T18:00:00Z", "sha256": "a" * 64},
                        {"dataset": "returning_production", "season": 2026, "fetched_at": "2026-09-10T18:00:00Z", "sha256": "b" * 64},
                    ],
                    "games": [{
                        "game_id": "football-readiness-1",
                        "status": "complete",
                        "home": side("1"),
                        "away": side("2"),
                    }],
                }
            candidates = (
                canonical,
                canonical.replace("&publication_check=1", ""),
                canonical.replace("?publication_check=1", ""),
            )
            for candidate in candidates:
                if candidate in responses:
                    return responses[candidate]
            # The publication audit uses the same shape for every ESPN class;
            # older fixtures can reuse their 2026 response when the class set
            # grows, while still exposing the requested season to the checker.
            if "/api/basketball/research/recruiting-rankings?season=" in canonical:
                fallback = re.sub(r"season=\d+", "season=2026", canonical)
                if fallback in responses:
                    value = dict(responses[fallback])
                    value["season"] = int(re.search(r"season=(\d+)", canonical).group(1))
                    return value
            return responses[canonical]
        return lookup

    def test_accepts_complete_player_box_field_coverage(self):
        payload = {
            "fields": ["pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"],
            "seasons": [{
                "season": 2026,
                "rows": 10,
                "fields": {
                    field: {"observed": 10, "share": 1.0, "numeric_observed": 10, "numeric_share": 1.0}
                    for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")
                },
            }],
        }
        self.assertEqual(player_box_field_metadata(payload), (9, 10, 9))

    def test_market_metadata_counts_research_capture_receipts(self):
        total, pregame, capabilities, receipts = market_metadata(
            {
                "sport": "basketball",
                "total": 0,
                "pregame": 0,
                "archive_receipts": [],
                "research_receipts": 3,
                "research_capture": {
                    "captured_at": "2026-09-10T18:00:00Z",
                    "summary_count": 20,
                    "summary_with_pickcenter": 0,
                    "accepted_markets": 0,
                    "rejected_records": 0,
                    "market_status": "no_quotes_published",
                },
                "provider_capabilities": [{
                    "provider": "ESPN Summary",
                    "markets": ["h2h"],
                    "provider_update_clock": False,
                }],
            },
            "basketball",
        )
        self.assertEqual((total, pregame, capabilities, receipts), (0, 0, 1, 3))

    def test_market_capture_status_reconciles_no_quote_and_validated_states(self):
        self.assertEqual(validate_market_capture({
            "research_receipts": 1,
            "research_capture": {
                "captured_at": "2026-09-10T18:00:00Z",
                "summary_count": 20,
                "summary_with_pickcenter": 0,
                "accepted_markets": 0,
                "rejected_records": 0,
                "market_status": "no_quotes_published",
            },
        }, "basketball"), "no_quotes_published")
        self.assertEqual(validate_market_capture({
            "research_capture": {
                "captured_at": "2026-09-10T18:00:00Z",
                "source_rows": 12,
                "rows_with_lines": 4,
                "accepted_markets": 4,
                "rejected_records": 1,
                "market_status": "validated_quotes",
            },
        }, "basketball"), "validated_quotes")

    def test_market_capture_receipts_without_status_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "receipts but no latest capture status"):
            validate_market_capture({"research_receipts": 1}, "basketball")

    def test_market_capture_marks_unreadable_eligible_summaries_incomplete(self):
        self.assertEqual(validate_market_capture({
            "research_capture": {
                "captured_at": "2026-09-10T18:00:00Z",
                "eligible_games": 12,
                "summary_count": 0,
                "summary_with_pickcenter": 0,
                "summary_fetch_failures": 12,
                "accepted_markets": 0,
                "rejected_records": 0,
                "market_status": "capture_incomplete",
            },
        }, "basketball"), "capture_incomplete")

    def test_market_capture_allows_accepted_subset_when_some_summaries_failed(self):
        self.assertEqual(validate_market_capture({
            "research_capture": {
                "captured_at": "2026-09-10T18:00:00Z",
                "eligible_games": 10,
                "summary_count": 9,
                "summary_with_pickcenter": 2,
                "summary_fetch_failures": 1,
                "accepted_markets": 3,
                "rejected_records": 1,
                "market_status": "capture_incomplete",
            },
        }, "basketball"), "capture_incomplete")

    def test_market_capture_rejects_inconsistent_no_quote_status(self):
        with self.assertRaisesRegex(ValueError, "no-quote status does not reconcile"):
            validate_market_capture({
                "research_capture": {
                    "captured_at": "2026-09-10T18:00:00Z",
                    "summary_count": 20,
                    "summary_with_pickcenter": 2,
                    "accepted_markets": 0,
                    "rejected_records": 0,
                    "market_status": "no_quotes_published",
                },
            }, "basketball")

    def test_rejects_player_box_field_coverage_without_core_stat(self):
        with self.assertRaisesRegex(ValueError, "missing core stats"):
            player_box_field_metadata({
                "fields": ["pts", "mins"],
                "seasons": [{
                    "season": 2026,
                    "rows": 10,
                    "fields": {
                        "pts": {"observed": 10, "share": 1.0, "numeric_observed": 10, "numeric_share": 1.0},
                        "mins": {"observed": 10, "share": 1.0, "numeric_observed": 10, "numeric_share": 1.0},
                    },
                }],
            })

    def test_rejects_player_box_field_coverage_without_numeric_quality(self):
        with self.assertRaisesRegex(ValueError, "field coverage is malformed"):
            player_box_field_metadata({
                "fields": ["pts"],
                "seasons": [{
                    "season": 2026,
                    "rows": 10,
                    "fields": {"pts": {"observed": 10, "share": 1.0}},
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

    def test_accepts_provider_neutral_public_recruiting_receipt(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        coverage = {"programs": 14, "players": 96, "events": 98, "sources": 44}
        payload = {
            "season": 2027,
            "first_recorded_at": "2026-09-10T18:00:00Z",
            "coverage": coverage,
            "source_receipt": {
                "dataset": "basketball_recruiting",
                "captured_at": "2026-09-10T18:00:00Z",
                "source_rows": 44,
                "sha256": "a" * 64,
                "integrity": "verified",
            },
        }
        self.assertEqual(
            validate_reviewed_recruiting_release(payload, now, 240),
            (coverage, 2.0),
        )

    def test_checks_both_sports_forecast_clock_and_recruiting_shape(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "audit_status": "complete",
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
            "/api/basketball/research/schedule-times?season=2027&meta=1&publication_check=1": {
                "season": 2027,
                "total": 142,
                "confirmed": 18,
                "provider": "ESPN Scoreboard",
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
                "seasons": [{"season": 2026, "rows": 100, "fields": {field: {"observed": 100, "share": 1.0, "numeric_observed": 100, "numeric_share": 1.0} for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")}}],
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting-rankings?season=2025&page=0&publication_check=1": {"season": 2025, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2026&page=0&publication_check=1": {"season": 2026, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2027&page=0&publication_check=1": {"season": 2027, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2028&page=0&publication_check=1": {"season": 2028, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2029&page=0&publication_check=1": {"season": 2029, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2030&page=0&publication_check=1": {"season": 2030, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting?season=2027&publication_check=1": {
                "season": 2027,
                "reviewed_at": "2026-09-10T18:00:00Z",
                "coverage": {"programs": 14, "players": 96, "events": 98, "sources": 44},
                "sources": [{"source_sha256": "a" * 64} for _ in range(44)],
                "people": [{"name": "Example one"}, {"name": "Example two"}],
            },
            "/api/basketball/research/news?meta=1": {
                "summary": {"total": 83, "latest_published": "2026-09-10T19:00:00Z", "latest_seen_at": "2026-09-10T19:00:00Z"},
                "releases": [{"article_count": 76}],
            },
            "/api/research/markets?meta=1&sport=basketball": {
                "sport": "basketball",
                "total": 0,
                "pregame": 0,
                "archive_receipts": [],
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
                "archive_receipts": [{"dataset": "odds", "season": 2026, "url": "https://example.test/odds", "fetched_at": "2026-09-10T18:00:00Z", "sha256": "a" * 64}],
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
        with patch("scripts.check_live_publication.get_json", side_effect=self.response_for(responses)), patch(
            "scripts.check_live_publication.football_personnel_readiness_metadata",
            wraps=football_personnel_readiness_metadata,
        ) as readiness_check:
            report = check_live("https://example.test", now=now)
        self.assertEqual(readiness_check.call_args.kwargs["expected_model_id"], "football-model-1")
        self.assertEqual(report["forecast_model"], "model-1")
        self.assertEqual(report["forecast_upcoming_rows"], 100)
        self.assertEqual(report["forecast_roster_scenario_rows"], 100)
        self.assertEqual(report["womens_forecast_model"], "womens-model-1")
        self.assertEqual(report["womens_forecast_rows"], 1)
        self.assertEqual(report["womens_forecast_validation_games"], 50)
        self.assertEqual(report["womens_forecast_calibration_games"], 100)
        self.assertEqual(report["matchup_personnel_game_id"], "401902275")
        self.assertEqual(report["matchup_personnel_listed_players"], 2)
        self.assertEqual(report["matchup_personnel_players_with_prior_minutes"], 1)
        self.assertEqual(report["matchup_personnel_players_with_stats"], 1)
        self.assertEqual(report["matchup_personnel_players_with_box_bpm"], 1)
        self.assertEqual(report["matchup_personnel_source_receipts"], 1)
        self.assertEqual(report["matchup_personnel_source_max_age_hours"], 2.0)
        self.assertEqual(report["recruiting_intake_rows"], 0)
        self.assertEqual(report["recruiting_rows"], 2)
        self.assertEqual(report["recruiting_reviewed_players"], 96)
        self.assertEqual(report["recruiting_reviewed_age_hours"], 2.0)
        self.assertEqual(report["recruiting_prospect_destination_groups"], {"2025": 1, "2026": 1, "2027": 1, "2028": 1, "2029": 1, "2030": 1})
        self.assertEqual(report["recruiting_prospect_rank_ties"], {str(season): {"tied_rank_values": 0, "tied_rows": 0} for season in (2025, 2026, 2027, 2028, 2029, 2030)})
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
                "audit_status": "complete",
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
            "/api/basketball/research/schedule-times?season=2027&meta=1&publication_check=1": {
                "season": 2027,
                "total": 142,
                "confirmed": 18,
                "provider": "ESPN Scoreboard",
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
                "seasons": [{"season": 2026, "rows": 100, "fields": {field: {"observed": 100, "share": 1.0, "numeric_observed": 100, "numeric_share": 1.0} for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")}}],
            },
            "/api/basketball/research/recruiting-intake?season=2027": {"total": 0, "providers": []},
            "/api/basketball/research/recruiting-rankings?season=2026&page=0&publication_check=1": {"season": 2026, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2027&page=0&publication_check=1": {"season": 2027, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2028&page=0&publication_check=1": {"season": 2028, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2029&page=0&publication_check=1": {"season": 2029, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
            "/api/basketball/research/recruiting-rankings?season=2030&page=0&publication_check=1": {"season": 2030, "total": 1, "captured_at": "2026-09-10T18:00:00Z", "source": {"provider": "ESPN Recruiting"}, "rank_quality": {"ranked_rows": 1, "tied_rank_values": 0, "tied_rows": 0}, "rows": [{"athlete_id": "1"}], "commitment_destinations": [{"team_id": "1", "team": "Example", "total": 1, "ranked_total": 1, "top100_total": 1, "best_rank": 1, "average_rank": 1, "position_breakdown": [{"position": "PG", "total": 1}]}]},
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
        with patch("scripts.check_live_publication.get_json", side_effect=self.response_for(responses)):
            with self.assertRaisesRegex(ValueError, "basketball market archive metadata"):
                check_live("https://example.test", now=now)

    def test_rejects_stale_basketball_source(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-08-01T18:00:00Z"}],
                "audit_status": "complete",
                "location_validation": {},
                "possession_validation": {},
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=self.response_for(responses)):
            with self.assertRaisesRegex(ValueError, "source games"):
                check_live("https://example.test", now=now)

    def test_rejects_stale_football_source(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "audit_status": "complete",
                "location_validation": {},
                "possession_validation": {},
            },
            "/api/football/coverage": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-08-01T18:00:00Z"}],
            },
        }
        with patch("scripts.check_live_publication.get_json", side_effect=self.response_for(responses)):
            with self.assertRaisesRegex(ValueError, "football source games"):
                check_live("https://example.test", now=now)

    def test_rejects_stale_reviewed_recruiting_release(self):
        now = datetime(2026, 9, 10, 20, tzinfo=timezone.utc)
        responses = {
            "/api/health": {"ok": True},
            "/api/basketball/research/coverage?audit=1": {
                "coverage": [{"dataset": "games"}],
                "source_receipts": [{"dataset": "games", "latest_source_at": "2026-09-10T18:00:00Z"}],
                "audit_status": "complete",
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
            "/api/basketball/research/schedule-times?season=2027&meta=1&publication_check=1": {
                "season": 2027,
                "total": 142,
                "confirmed": 18,
                "provider": "ESPN Scoreboard",
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
                "seasons": [{"season": 2026, "rows": 100, "fields": {field: {"observed": 100, "share": 1.0, "numeric_observed": 100, "numeric_share": 1.0} for field in ("pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb")}}],
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
        with patch("scripts.check_live_publication.get_json", side_effect=self.response_for(responses)):
            with self.assertRaisesRegex(ValueError, "reviewed recruiting release"):
                check_live("https://example.test", now=now)


if __name__ == "__main__":
    unittest.main()
