import sqlite3
import unittest

from ncaa_scraper.ncaa_individual import (
    INDIVIDUAL_STATS,
    STAT_FALLBACKS,
    SCHEMA,
    decode_html,
    export_release,
    ensure_schema,
    invalid_ranking_page,
    parse_table,
    to_num,
)


class NCAAIndividualTests(unittest.TestCase):
    def test_cached_byte_repr_decodes_and_minutes_parse(self):
        html = "b'<tbody>\\n<tr><td>1</td><td>Player, School (Conf)</td><td>Sr.</td><td>6-4</td><td>G</td><td>\\n 35 \\n</td><td>\\n 1,233 \\n</td><td>\\n 39:47 \\n</td></tr>\\n</tbody>'"
        decoded = decode_html(html)
        headers, rows = parse_table(decoded)
        self.assertEqual(headers, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(to_num("39:47"), 39 + 47 / 60)

    def test_export_release_reports_division_coverage(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO ncaa_team_directory (team_ncaa_id,division,name) VALUES (?,?,?)",
            (42, 1, "A School"),
        )
        conn.execute(
            "INSERT INTO ncaa_players (player_id,division,name,team_name,ppg,mpg,ppg_rank,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (7, 1, "A Player", "A School", 20.5, 30.0, 1, "2026-06-12 23:00:00"),
        )
        release = export_release(conn)
        self.assertEqual(release["coverage"]["players"], 1)
        self.assertEqual(release["coverage"]["divisions"]["1"]["ppg"], 1)
        self.assertEqual(release["players"][0]["name"], "A Player")
        self.assertEqual(release["players"][0]["team_ncaa_id"], 42)
        self.assertEqual(release["generated_at"], "2026-06-12T23:00:00Z")

    def test_export_release_keeps_complete_source_measure_rows(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO ncaa_players (player_id,division,name,source_stats_json,updated_at) VALUES (?,?,?,?,?)",
            (8, 1, "Source Player", '{"ppg":{"headers":["Rank","Player","PTS"],"cells":["4","Source Player","22.1"],"rank":4,"value":22.1}}', "2026-06-12 23:00:00"),
        )
        release = export_release(conn)
        source = release["players"][0]["source_stats"]["ppg"]
        self.assertEqual(source["headers"][-1], "PTS")
        self.assertEqual(source["cells"][-1], "22.1")
        self.assertEqual(source["rank"], 4)

    def test_ensure_schema_upgrades_legacy_snapshot(self):
        conn = sqlite3.connect(":memory:")
        legacy_schema = SCHEMA.replace("  source_stats_json TEXT,\n", "")
        conn.executescript(legacy_schema)
        ensure_schema(conn)
        self.assertIn("source_stats_json", {row[1] for row in conn.execute("PRAGMA table_info(ncaa_players)")})

    def test_assists_uses_current_ncaa_sequence_and_rejects_stale_body(self):
        self.assertEqual(INDIVIDUAL_STATS["140.0"], "apg")
        self.assertEqual(STAT_FALLBACKS["apg"], ("216.0",))
        self.assertNotIn("216.0", INDIVIDUAL_STATS)
        self.assertTrue(invalid_ranking_page("b'Invalid ranking period'"))
        self.assertFalse(invalid_ranking_page("<table><tbody><tr><td>1</td></tr></tbody></table>"))


if __name__ == "__main__":
    unittest.main()
