import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ncaa_scraper.basketball_within_impact import build


class BasketballWithinImpactTests(unittest.TestCase):
    def test_builds_source_native_rows_and_qualifies_by_team_possessions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "within.parquet"
            pq.write_table(pa.table({
                "team": ["Alpha", "Alpha", "Beta"],
                "player_code": ["Doe, Jane", "Smith, Pat", "Other, Sam"],
                "rapm_off": [1.5, -1.0, 0.0],
                "rapm_def": [0.5, 0.5, 0.0],
                "team_off_poss": [1000.0, 200.0, 800.0],
                "num_players": [10, 10, 8],
                "rapm_net": [2.0, -1.5, 0.0],
                "season": [2026, 2026, 2025],
                "player_id": ["1", "2", "3"],
                "team_id": ["a", "a", "b"],
                "person_id": ["p1", "p2", "p3"],
            }), path)
            result = build(path, {"sha256": "receipt"}, 2026)
        self.assertEqual(result["coverage"]["source_rows"], 2)
        self.assertEqual(result["coverage"]["qualified"], 1)
        self.assertEqual(result["players"][0]["player"], "Jane Doe")
        self.assertEqual(result["players"][0]["rank"], 1)
        self.assertIsNone(result["players"][1]["rank"])


if __name__ == "__main__":
    unittest.main()
