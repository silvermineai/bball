import tempfile
import unittest
import sqlite3
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ncaa_scraper.basketball_possessions import build_season, ensure_local_schema


class BasketballPossessionStyleTests(unittest.TestCase):
    def test_clean_local_database_gets_receipt_schema(self):
        conn = sqlite3.connect(":memory:")
        ensure_local_schema(conn)
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        self.assertIn("bb_sources", tables)
        self.assertIn("bb_possession_style", tables)
        conn.close()

    def test_aggregates_team_flags_without_player_credit(self):
        rows = [
            {"season": 2026, "contest_id": "g1", "poss_team_espn_team_id": "10", "poss_team_ncaa_team_id": "n10", "home": "Alpha", "away": "Beta", "poss_team": "Alpha", "pts": 2, "is_transition": 1, "is_assisted": 0, "is_garbage_time": 0},
            {"season": 2026, "contest_id": "g1", "poss_team_espn_team_id": "10", "poss_team_ncaa_team_id": "n10", "home": "Alpha", "away": "Beta", "poss_team": "Alpha", "pts": 3, "is_transition": 0, "is_assisted": 1, "is_garbage_time": 0},
            {"season": 2026, "contest_id": "g1", "poss_team_espn_team_id": "20", "poss_team_ncaa_team_id": "n20", "home": "Alpha", "away": "Beta", "poss_team": "Beta", "pts": 0, "is_transition": 0, "is_assisted": 0, "is_garbage_time": 1},
        ]
        columns = sorted({key for row in rows for key in row})
        table = pa.table({key: [row.get(key) for row in rows] for key in columns})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "possessions.parquet"
            pq.write_table(table, path)
            result = build_season(path, {"sha256": "a" * 64, "url": "https://example.test/release"}, 2026)
        alpha = next(row for row in result["teams"] if row["team_id"] == "10")
        self.assertEqual(result["coverage"]["source_rows"], 3)
        self.assertEqual(alpha["possessions"], 2)
        self.assertEqual(alpha["points"], 5)
        self.assertEqual(alpha["transition_share"], 0.5)
        self.assertEqual(alpha["assisted_share"], 0.5)

    def test_reports_malformed_points_and_flags(self):
        rows = [{
            "season": 2026,
            "contest_id": "g1",
            "poss_team_espn_team_id": "10",
            "poss_team_ncaa_team_id": "n10",
            "home": "Alpha",
            "away": "Beta",
            "poss_team": "Alpha",
            "pts": 2.5,
            "is_transition": 2,
            "is_assisted": None,
            "is_garbage_time": 0,
        }]
        columns = sorted({key for row in rows for key in row})
        table = pa.table({key: [row.get(key) for row in rows] for key in columns})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "possessions.parquet"
            pq.write_table(table, path)
            result = build_season(path, {"sha256": "b" * 64, "url": "https://example.test/release"}, 2026)
        self.assertEqual(result["coverage"]["invalid_points"], 1)
        self.assertEqual(result["coverage"]["invalid_flag_rows"], 2)
        self.assertEqual(result["teams"][0]["points"], 0)


if __name__ == "__main__":
    unittest.main()
