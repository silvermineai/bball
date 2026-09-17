import sqlite3
import tempfile
import unittest
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[2] / "scripts/verify-basketball-d1.py"
SPEC = importlib.util.spec_from_file_location("verify_basketball_d1", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VerifyBasketballD1Test(unittest.TestCase):
    def test_local_table_count_reads_present_table(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "warehouse.sqlite3"
            with sqlite3.connect(path) as conn:
                conn.execute("CREATE TABLE sample (id INTEGER)")
                conn.executemany("INSERT INTO sample VALUES (?)", [(1,), (2,)])
            self.assertEqual(MODULE.local_table_count(path, "sample"), 2)

    def test_local_table_count_returns_none_for_empty_placeholder(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "warehouse.sqlite3"
            path.touch()
            self.assertIsNone(MODULE.local_table_count(path, "sample"))


if __name__ == "__main__":
    unittest.main()
