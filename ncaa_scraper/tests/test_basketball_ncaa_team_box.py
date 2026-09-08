import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ncaa_scraper.basketball_ncaa_team_box import aggregate


class NcaaTeamBoxTests(unittest.TestCase):
    def test_aggregates_counts_and_recomputes_rates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "team-box.parquet"
            pq.write_table(pa.table({
                "team": ["Alpha", "Alpha", "Beta"],
                "team_ncaa_team_id": ["a", "a", "b"],
                "team_espn_team_id": ["1", "1", "2"],
                "contest_id": ["g1", "g2", "g1"],
                "season": [2026, 2026, 2026],
                "o_poss": [50.0, 60.0, 50.0], "d_poss": [50.0, 60.0, 50.0],
                "pts": [60.0, 72.0, 50.0], "d_pts": [50.0, 60.0, 55.0],
                "fga": [40.0, 40.0, 40.0], "d_fga": [40.0, 40.0, 40.0],
                "fgm": [20.0, 20.0, 18.0], "d_fgm": [18.0, 18.0, 20.0],
                "tpa": [20.0, 20.0, 20.0], "d_tpa": [20.0, 20.0, 20.0],
                "tpm": [8.0, 8.0, 6.0], "d_tpm": [6.0, 6.0, 8.0],
                "fta": [10.0, 10.0, 10.0], "d_fta": [10.0, 10.0, 10.0],
                "ftm": [8.0, 8.0, 7.0], "d_ftm": [7.0, 7.0, 8.0],
                "rima": [10.0, 10.0, 10.0], "d_rima": [10.0, 10.0, 10.0],
                "rimm": [5.0, 5.0, 4.0], "d_rimm": [4.0, 4.0, 5.0],
                "orb": [5.0, 5.0, 4.0], "d_orb": [4.0, 4.0, 5.0],
                "drb": [15.0, 15.0, 14.0], "d_drb": [14.0, 14.0, 15.0],
                "blk": [2.0, 2.0, 1.0], "d_blk": [1.0, 1.0, 2.0],
                "to": [5.0, 5.0, 6.0], "d_to": [6.0, 6.0, 5.0],
                "ast": [10.0, 10.0, 8.0], "d_ast": [8.0, 8.0, 10.0],
                "e_poss": [50.0, 60.0, 50.0],
            }), path)
            result = aggregate(path, {"sha256": "receipt"}, 2026)
        self.assertEqual(result["coverage"]["teams"], 2)
        self.assertEqual(result["coverage"]["contests"], 2)
        alpha = next(row for row in result["teams"] if row["team_id"] == "a")
        self.assertEqual(alpha["games"], 2)
        self.assertEqual(alpha["points"], 132)
        self.assertAlmostEqual(alpha["off_rtg"], 120)
        self.assertAlmostEqual(alpha["net_rtg"], 20)
        self.assertAlmostEqual(alpha["efg_pct"], 0.6)


if __name__ == "__main__":
    unittest.main()
