import json
import sqlite3
import unittest

from ncaa_scraper.ncaa_individual import SCHEMA
from ncaa_scraper.ncaa_individual_enrichment import box_apg, enrich_release


class NCAAIndividualEnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript("""
            CREATE TABLE bb_ncaa_player_box (
              season INTEGER, contest_id TEXT, player_id TEXT,
              stats_json TEXT NOT NULL
            );
        """)
        for contest, assists in (("g1", 4), ("g2", 2), ("g2", 9)):
            self.conn.execute(
                "INSERT INTO bb_ncaa_player_box VALUES (?,?,?,?)",
                (2026, contest, "101", json.dumps({"ast": assists})),
            )
        self.conn.execute(
            "INSERT INTO bb_ncaa_player_box VALUES (?,?,?,?)",
            (2026, "g1", "202", json.dumps({"ast": 99})),
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_counts_distinct_contests(self):
        self.assertEqual(box_apg(self.conn)["101"], (7.5, 2))

    def test_enrichment_uses_exact_ids_and_preserves_existing_values(self):
        release = {
            "schema_version": 1,
            "season": 2026,
            "coverage": {"divisions": {"1": {"apg": 0}}},
            "players": [
                {"player_id": "101", "division": 1, "apg": None},
                {"player_id": "202", "division": 1, "apg": 3.0},
                {"player_id": "303", "division": 1, "apg": None},
            ],
        }
        enriched = enrich_release(release, self.conn, {"sha256": "a" * 64, "url": "box"})
        self.assertEqual(enriched["players"][0]["apg"], 7.5)
        self.assertEqual(enriched["players"][1]["apg"], 3.0)
        self.assertIsNone(enriched["players"][2]["apg"])
        self.assertEqual(enriched["supplements"]["apg"]["values"], 1)
        self.assertEqual(enriched["supplements"]["apg"]["source_sha256"], "a" * 64)


if __name__ == "__main__":
    unittest.main()
