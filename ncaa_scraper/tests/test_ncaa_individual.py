import sqlite3
import unittest

from ncaa_scraper.ncaa_individual import SCHEMA, decode_html, export_release, parse_table, to_num


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


if __name__ == "__main__":
    unittest.main()
