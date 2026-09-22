"""Tests for the national NCAA player snapshot D1 publisher."""

import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "sync-ncaa-individual.py"
SPEC = importlib.util.spec_from_file_location("sync_ncaa_individual", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SyncNCAAIndividualTest(unittest.TestCase):
    def fixture(self, directory: str):
        public = Path(directory) / "ncaa-individual.json"
        release = {
            "schema_version": 2,
            "season": 2026,
            "players": [{
                "division": 2,
                "player_id": 7,
                "name": "Exact Player",
                "team_name": "Example State",
                "ppg": 21.5,
                "rpg": None,
                "apg": None,
                "mpg": 31.2,
                "ppg_rank": 4,
            }],
        }
        public.write_text(json.dumps(release))
        receipt = {
            "dataset": "ncaa_individual",
            "season": 2026,
            "url": "https://stats.ncaa.org/rankings/national_ranking",
            "fetched_at": "2026-09-10T13:27:22Z",
            "sha256": hashlib.sha256(public.read_bytes()).hexdigest(),
            "kind": "normalized_public_derivative",
        }
        receipt_path = Path(directory) / "receipt.json"
        receipt_path.write_text(json.dumps(receipt))
        return public, receipt_path, release, receipt

    def test_sync_sql_publishes_the_exact_archived_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            public, receipt_path, release, expected_receipt = self.fixture(directory)
            receipt = MODULE.load_receipt(release, public, receipt_path)
            sql = MODULE.build_sql(release, receipt)
            connection = sqlite3.connect(":memory:")
            try:
                connection.executescript(sql)
                row = connection.execute(
                    "SELECT dataset,season,receipt_json FROM bb_sources"
                ).fetchone()
                self.assertEqual(row[:2], ("ncaa_individual", 2026))
                self.assertEqual(json.loads(row[2]), expected_receipt)
                player = connection.execute(
                    "SELECT division,player_id,name,ppg,rpg FROM ncaa_individual_players"
                ).fetchone()
                self.assertEqual(player, (2, "7", "Exact Player", 21.5, None))
            finally:
                connection.close()

    def test_stale_receipt_cannot_be_published_for_a_changed_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            public, receipt_path, release, _receipt = self.fixture(directory)
            public.write_text(json.dumps({**release, "players": [{**release["players"][0], "ppg": 22.0}]}))
            with self.assertRaisesRegex(ValueError, "does not match"):
                MODULE.load_receipt(release, public, receipt_path)


if __name__ == "__main__":
    unittest.main()
