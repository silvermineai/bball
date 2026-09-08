import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ncaa_scraper.basketball_matchups import aggregate


class BasketballMatchupTests(unittest.TestCase):
    def test_aggregates_stints_by_source_lineup_pair(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "matchups.parquet"
            pq.write_table(
                pa.table(
                    {
                        "contest_id": ["g1", "g1", "g2"],
                        "season": [2026, 2026, 2026],
                        "game_date": ["2025-11-01", "2025-11-01", "2025-11-02"],
                        "home": ["Alpha", "Alpha", "Alpha"],
                        "away": ["Beta", "Beta", "Beta"],
                        "duration_seconds": [120, 60, 180],
                        "home_lineup_key": ["h", "h", "h"],
                        "away_lineup_key": ["a", "a", "a"],
                        "home_lineup": ["A.B|C.D", "A.B|C.D", "A.B|C.D"],
                        "away_lineup": ["E.F|G.H", "E.F|G.H", "E.F|G.H"],
                        "n_events": [10, 5, 20],
                        "n_possessions": [8, 4, 12],
                        "home_pts": [10, 2, 15],
                        "away_pts": [6, 4, 9],
                    }
                ),
                path,
            )
            result = aggregate(path, {"sha256": "receipt"}, 2026)
        self.assertEqual(result["coverage"]["source_rows"], 3)
        self.assertEqual(result["coverage"]["source_contests"], 2)
        self.assertEqual(result["coverage"]["source_matchups"], 1)
        row = result["matchups"][0]
        self.assertEqual(row["games"], 2)
        self.assertEqual(row["possessions"], 24)
        self.assertEqual(row["home_points"], 27)
        self.assertEqual(row["away_points"], 19)
        self.assertEqual(row["home_lineup"], ["A B", "C D"])

    def test_limit_keeps_high_volume_pairs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "matchups.parquet"
            pq.write_table(
                pa.table(
                    {
                        "contest_id": ["g1", "g2"], "season": [2026, 2026], "game_date": [None, None],
                        "home": ["A", "A"], "away": ["B", "B"], "duration_seconds": [60, 60],
                        "home_lineup_key": ["h1", "h2"], "away_lineup_key": ["a1", "a2"],
                        "home_lineup": ["A", "B"], "away_lineup": ["C", "D"], "n_events": [1, 1],
                        "n_possessions": [10, 2], "home_pts": [12, 2], "away_pts": [2, 2],
                    }
                ), path,
            )
            result = aggregate(path, {"sha256": "receipt"}, 2026, limit=1)
        self.assertEqual(result["coverage"]["published_matchups"], 1)
        self.assertTrue(result["coverage"]["truncated"])
        self.assertEqual(result["matchups"][0]["possessions"], 10)


if __name__ == "__main__":
    unittest.main()
