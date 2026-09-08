import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ncaa_scraper.pbp_catalog import index


class PbpCatalogTests(unittest.TestCase):
    def test_indexes_games_without_copying_event_payloads(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pbp.parquet"
            table = pa.table(
                {
                    "id": [1, 2, 3],
                    "game_id": ["g1", "g1", "g2"],
                    "season": [2023, 2023, 2023],
                    "scoring_play": [True, False, True],
                    "shooting_play": [True, False, False],
                    "home_team_id": [10, 10, 20],
                    "away_team_id": [11, 11, 21],
                    "home_team_name": ["Home", "Home", "Other"],
                    "away_team_name": ["Away", "Away", "Visitor"],
                    "game_date": [None, None, None],
                    "game_date_time": [
                        datetime(2023, 1, 2, tzinfo=timezone.utc),
                        datetime(2023, 1, 2, tzinfo=timezone.utc),
                        datetime(2023, 1, 1, tzinfo=timezone.utc),
                    ],
                }
            )
            pq.write_table(table, path)
            result = index(path, {"sha256": "receipt"}, 2023)
        self.assertEqual(result["coverage"]["pbp_events"], 3)
        self.assertEqual(result["coverage"]["pbp_games"], 2)
        self.assertEqual(result["coverage"]["teams"], 4)
        self.assertEqual(result["games"][0]["id"], "g1")
        self.assertEqual(result["games"][0]["events"], 2)
        self.assertEqual(result["games"][0]["shooting_plays"], 1)
        self.assertEqual(result["games"][0]["home_id"], "10")
        self.assertNotIn("text", result["games"][0])

    def test_excludes_rows_from_other_seasons(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pbp.parquet"
            values = {
                "id": [1, 2], "game_id": ["g1", "g2"], "season": [2022, 2023],
                "scoring_play": [None, None], "shooting_play": [None, None],
                "home_team_id": [None, None], "away_team_id": [None, None],
                "home_team_name": [None, None], "away_team_name": [None, None],
                "game_date": [None, None], "game_date_time": [None, None],
            }
            pq.write_table(pa.table(values), path)
            result = index(path, {"sha256": "receipt"}, 2023)
        self.assertEqual([game["id"] for game in result["games"]], ["g2"])


if __name__ == "__main__":
    unittest.main()
