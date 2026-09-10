import json
import sqlite3
import unittest

from ncaa_scraper.ncaa_individual import SCHEMA
from ncaa_scraper.ncaa_individual_enrichment import box_apg, box_assist_totals, box_double_doubles, enrich_release


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
        self.conn.execute(
            "INSERT INTO bb_ncaa_player_box VALUES (?,?,?,?)",
            (2026, "g3", "404", json.dumps({"pts": 21, "orb": 5, "drb": 5, "ast": 10, "stl": 1, "blk": 0, "pf": 2, "o_poss": 18, "tpm": 1, "tpa": 3, "mins": 31.5})),
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_counts_distinct_contests(self):
        self.assertEqual(box_apg(self.conn)["101"], (7.5, 2))
        self.assertEqual(box_assist_totals(self.conn)["101"], (15.0, 2))

    def test_counts_double_double_categories_per_contest(self):
        self.assertEqual(box_double_doubles(self.conn)["404"], 1)

    def test_enrichment_preserves_complete_box_totals(self):
        release = {
            "schema_version": 1,
            "season": 2026,
            "coverage": {"divisions": {"1": {}}},
            "players": [{"player_id": "404", "division": 1}],
        }
        player = enrich_release(release, self.conn, {"sha256": "a" * 64, "url": "box"})["players"][0]
        self.assertEqual({key: player[key] for key in ("orb", "drb", "pf", "o_poss", "tpm", "tpa")}, {"orb": 5, "drb": 5, "pf": 2, "o_poss": 18, "tpm": 1, "tpa": 3})
        self.assertEqual(player["mins"], 31.5)

    def test_enrichment_uses_exact_ids_and_preserves_existing_values(self):
        release = {
            "schema_version": 1,
            "season": 2026,
            "coverage": {"divisions": {"1": {"apg": 0, "ast": 0}}},
            "players": [
                {"player_id": "101", "division": 1, "apg": None, "ast": None},
                {"player_id": "202", "division": 1, "apg": 3.0, "ast": None},
                {"player_id": "303", "division": 1, "apg": None, "ast": None},
            ],
        }
        enriched = enrich_release(release, self.conn, {"sha256": "a" * 64, "url": "box"})
        self.assertEqual(enriched["players"][0]["apg"], 7.5)
        self.assertEqual(enriched["players"][0]["ast"], 15)
        self.assertEqual(enriched["players"][1]["apg"], 3.0)
        self.assertEqual(enriched["players"][1]["ast"], 99)
        self.assertIsNone(enriched["players"][2]["apg"])
        self.assertEqual(enriched["supplements"]["apg"]["values"], 1)
        self.assertEqual(enriched["supplements"]["ast"]["values"], 2)
        self.assertEqual(enriched["coverage"]["divisions"]["1"]["ast"], 2)
        self.assertEqual(enriched["supplements"]["apg"]["source_sha256"], "a" * 64)


if __name__ == "__main__":
    unittest.main()
