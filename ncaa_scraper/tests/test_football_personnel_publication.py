import copy
import unittest
from datetime import datetime, timezone

from scripts.check_live_publication import football_personnel_readiness_metadata


def payload():
    return {
        "version": "football-personnel-readiness-v1",
        "generated_at": "2026-09-21T20:00:00Z",
        "target_season": 2026,
        "primary_model_id": "model-1",
        "coverage": {
            "forecast_games": 1,
            "team_sides": 2,
            "complete_games": 1,
            "partial_games": 0,
            "conflict_games": 0,
            "unavailable_games": 0,
            "field_side_counts": {field: 2 for field in (
                "talent_composite", "talent_rank", "blue_chip_ratio",
                "off_returning", "def_returning", "overall_returning",
            )},
            "personnel_teams": 2,
        },
        "feature_fields": [
            "talent_composite", "talent_rank", "blue_chip_ratio",
            "off_returning", "def_returning", "overall_returning",
        ],
        "source_receipts": [
            {"dataset": "team_talent", "season": 2026, "fetched_at": "2026-09-21T19:00:00Z", "sha256": "a" * 64},
            {"dataset": "returning_production", "season": 2026, "fetched_at": "2026-09-21T19:00:00Z", "sha256": "b" * 64},
        ],
        "games": [{
            "game_id": "g1",
            "status": "complete",
            "home": {"team_id": "1", "available_fields": ["talent_composite", "talent_rank", "blue_chip_ratio", "off_returning", "def_returning", "overall_returning"], "source_datasets": ["team_talent", "returning_production"], "conflicting_fields": []},
            "away": {"team_id": "2", "available_fields": ["talent_composite", "talent_rank", "blue_chip_ratio", "off_returning", "def_returning", "overall_returning"], "source_datasets": ["team_talent", "returning_production"], "conflicting_fields": []},
        }],
    }


class FootballPersonnelPublicationTests(unittest.TestCase):
    now = datetime(2026, 9, 21, 21, tzinfo=timezone.utc)

    def test_validates_exact_id_rows_and_fresh_receipts(self):
        coverage, age = football_personnel_readiness_metadata(payload(), self.now, 36, expected_model_id="model-1")
        self.assertEqual(coverage["forecast_games"], 1)
        self.assertEqual(age, 2.0)

    def test_rejects_status_or_row_count_drift(self):
        bad = copy.deepcopy(payload())
        bad["games"][0]["status"] = "unavailable"
        with self.assertRaisesRegex(ValueError, "status rows do not reconcile"):
            football_personnel_readiness_metadata(bad, self.now, 36)

    def test_rejects_duplicate_game_identity(self):
        bad = copy.deepcopy(payload())
        bad["coverage"]["forecast_games"] = 2
        bad["coverage"]["team_sides"] = 4
        bad["coverage"]["complete_games"] = 2
        bad["coverage"]["personnel_teams"] = 4
        bad["games"].append(copy.deepcopy(bad["games"][0]))
        with self.assertRaisesRegex(ValueError, "game identity is not unique"):
            football_personnel_readiness_metadata(bad, self.now, 36)

    def test_rejects_context_from_another_model_edition(self):
        with self.assertRaisesRegex(ValueError, "model identity"):
            football_personnel_readiness_metadata(payload(), self.now, 36, expected_model_id="different-model")


if __name__ == "__main__":
    unittest.main()
