import importlib.util
import json
import sqlite3
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/build-basketball-coverage.py"
spec = importlib.util.spec_from_file_location("basketball_coverage", SCRIPT)
assert spec and spec.loader
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)


class BasketballCoverageTests(unittest.TestCase):
    def test_counts_source_observations_without_attributing_identity(self):
        conn = sqlite3.connect(":memory:")
        conn.execute(
            "CREATE TABLE bb_unresolved (dataset TEXT, season INTEGER, row_index INTEGER, reason TEXT, source_json TEXT)"
        )
        conn.executemany(
            "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
            [
                ("ncaa_shots", 2026, 0, "Missing NCAA shooter or team ID", json.dumps({"made": True})),
                ("player_box", 2026, 1, "Missing athlete ID", json.dumps({"points": ""})),
                ("player_box", 2026, 2, "Missing athlete ID", json.dumps({"points": "12"})),
            ],
        )
        self.assertEqual(
            coverage.build(conn),
            [
                {"dataset": "ncaa_shots", "reason": "Missing NCAA shooter or team ID", "rows": 1, "rows_with_observed_stats": 1},
                {"dataset": "player_box", "reason": "Missing athlete ID", "rows": 2, "rows_with_observed_stats": 1},
            ],
        )
        conn.close()


if __name__ == "__main__":
    unittest.main()
