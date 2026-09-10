import tempfile
import unittest
from pathlib import Path

from scripts.sql_batches import split_sql_file


class SqlBatchTests(unittest.TestCase):
    def test_deletes_are_isolated_and_inserts_are_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "release.sql"
            source.write_bytes(
                b"DELETE FROM football_games WHERE season=2026;\n"
                b"DELETE FROM football_stats WHERE season=2026;\n"
                b"INSERT INTO football_stats VALUES (1,'a');\n"
                b"INSERT INTO football_stats VALUES (2,'b');\n"
                b"INSERT INTO football_stats VALUES (3,'c');\n"
            )
            chunks = split_sql_file(source, root / "chunks", max_bytes=55)
            self.assertEqual([p.name for p in chunks[:2]], ["delete-0000.sql", "delete-0001.sql"])
            self.assertTrue(all(p.stat().st_size <= 55 for p in chunks[2:]))
            self.assertEqual(b"".join(p.read_bytes() for p in chunks), source.read_bytes())

    def test_replay_clears_stale_chunks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "release.sql"
            source.write_text("INSERT INTO t VALUES (1);\n")
            chunks = root / "chunks"
            split_sql_file(source, chunks)
            stale = chunks / "stale.sql"
            stale.write_text("bad")
            split_sql_file(source, chunks)
            self.assertFalse(stale.exists())


if __name__ == "__main__":
    unittest.main()
