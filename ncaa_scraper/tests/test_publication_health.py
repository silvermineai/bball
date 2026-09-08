import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from ncaa_scraper.publication_health import check_freshness


def write_release(root, sport, name, value):
    path = Path(root) / "frontend/public/data" / sport / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


class PublicationHealthTest(unittest.TestCase):
    def payload(self, season=2027):
        return {
            "generated_at": "2026-09-07T12:00:00Z",
            "season": season,
            "coverage": {"forecast_games": 2, "upcoming_games": 3},
            "model": {"id": "model-test"},
            "ratings": [{"id": "1"}],
        }

    def football_catalog(self):
        return {
            "latest_source_retrieved_at": "2026-09-07T12:00:00Z",
            "seasons": [
                {"season": year, "box_rows": 10}
                for year in range(2018, 2027)
            ],
        }

    def test_selected_sport_passes_timestamp_and_shape_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            write_release(directory, "football", "overview.json", self.payload(2026))
            write_release(directory, "football", "player-catalog.json", self.football_catalog())
            report = check_freshness(
                Path(directory),
                "football",
                now=datetime(2026, 9, 8, tzinfo=timezone.utc),
                max_age_hours=48,
            )
            self.assertTrue(report["ok"])
            self.assertEqual(report["releases"][0]["release"], "football/overview.json")

    def test_basketball_requires_supplemental_catalogs(self):
        with tempfile.TemporaryDirectory() as directory:
            write_release(directory, "basketball", "overview.json", self.payload())
            write_release(
                directory,
                "basketball",
                "ncaa-individual.json",
                {"generated_at": "2026-09-07T12:00:00Z", "season": 2026},
            )
            with self.assertRaises(ValueError) as error:
                check_freshness(
                    Path(directory),
                    "basketball",
                    now=datetime(2026, 9, 8, tzinfo=timezone.utc),
                    max_age_hours=48,
                )
            self.assertIn("history/index.json", str(error.exception))

    def test_basketball_requires_matching_ncaa_season(self):
        with tempfile.TemporaryDirectory() as directory:
            write_release(directory, "basketball", "overview.json", self.payload())
            write_release(
                directory,
                "basketball",
                "ncaa-individual.json",
                {"generated_at": "2026-09-07T12:00:00Z", "season": 2025},
            )
            with self.assertRaises(ValueError) as error:
                check_freshness(
                    Path(directory),
                    "basketball",
                    now=datetime(2026, 9, 8, tzinfo=timezone.utc),
                    max_age_hours=48,
                )
            self.assertIn("NCAA leaderboard season", str(error.exception))

    def test_stale_release_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            write_release(directory, "football", "overview.json", self.payload(2026))
            with self.assertRaises(ValueError) as error:
                check_freshness(
                    Path(directory),
                    "football",
                    now=datetime(2026, 9, 20, tzinfo=timezone.utc),
                    max_age_hours=48,
                )
            self.assertIn("hours old", str(error.exception))

    def test_malformed_coverage_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as directory:
            payload = self.payload(2026)
            payload["coverage"]["forecast_games"] = None
            write_release(directory, "football", "overview.json", payload)
            with self.assertRaises(ValueError) as error:
                check_freshness(
                    Path(directory),
                    "football",
                    now=datetime(2026, 9, 8, tzinfo=timezone.utc),
                    max_age_hours=48,
                )
            self.assertIn("invalid forecast coverage counts", str(error.exception))

    def test_baseline_estimates_cannot_exceed_schedule(self):
        with tempfile.TemporaryDirectory() as directory:
            payload = self.payload()
            payload["coverage"]["baseline_estimate_games"] = 2
            write_release(directory, "basketball", "overview.json", payload)
            write_release(
                directory,
                "basketball",
                "ncaa-individual.json",
                {"generated_at": "2026-09-07T12:00:00Z", "season": 2026},
            )
            with self.assertRaises(ValueError) as error:
                check_freshness(
                    Path(directory),
                    "basketball",
                    now=datetime(2026, 9, 8, tzinfo=timezone.utc),
                    max_age_hours=48,
                )
            self.assertIn("baseline estimates exceed", str(error.exception))


if __name__ == "__main__":
    unittest.main()
