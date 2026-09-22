import sqlite3
import tempfile
import unittest
from pathlib import Path

from ncaa_scraper.ncaa_individual import (
    INDIVIDUAL_STATS,
    STAT_FALLBACKS,
    SCHEMA,
    decode_html,
    export_release,
    final_period,
    ensure_schema,
    invalid_ranking_page,
    parse_table,
    atomic_write,
    release_is_degraded,
    source_totals,
    to_num,
    parse_player_identity,
)


class NCAAIndividualTests(unittest.TestCase):
    def test_final_period_prefers_publishers_selected_final_statistics_option(self):
        class CachedFetcher:
            def fetch(self, *_args, **_kwargs):
                return (
                    '<select>'
                    '<option value="12.0">03/01/2026-Final Statistics</option>'
                    '<option value="19.0" selected>04/05/2026-Final Statistics</option>'
                    '</select>'
                )

        self.assertEqual(final_period(CachedFetcher(), "2.0"), "19.0")

    def test_final_period_falls_back_to_first_final_option_for_legacy_cache(self):
        class CachedFetcher:
            def fetch(self, *_args, **_kwargs):
                return '<option value="12.0">03/01/2026-Final Statistics</option>'

        self.assertEqual(final_period(CachedFetcher(), "2.0"), "12.0")

    def test_cached_byte_repr_decodes_and_minutes_parse(self):
        html = "b'<tbody>\\n<tr><td>1</td><td>Player, School (Conf)</td><td>Sr.</td><td>6-4</td><td>G</td><td>\\n 35 \\n</td><td>\\n 1,233 \\n</td><td>\\n 39:47 \\n</td></tr>\\n</tbody>'"
        decoded = decode_html(html)
        headers, rows = parse_table(decoded)
        self.assertEqual(headers, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(to_num("39:47"), 39 + 47 / 60)

    def test_player_identity_resolves_class_suffix_before_team(self):
        player, team, conference = parse_player_identity(
            "Darin Smith, Jr., Central Conn. St. (NEC)",
            {"centralconnst": "Central Conn. St."},
        )
        self.assertEqual((player, team, conference), ("Darin Smith", "Central Conn. St.", "NEC"))

    def test_player_identity_resolves_team_names_with_parentheses(self):
        player, team, conference = parse_player_identity(
            "Koi D. Kirk, Dominican (NY) (CACC)",
            {"dominicanny": "Dominican (NY)"},
        )
        self.assertEqual((player, team, conference), ("Koi D. Kirk", "Dominican (NY)", "CACC"))

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
        self.assertEqual(release["coverage"]["divisions"]["1"]["team_ncaa_id"], 1)
        self.assertEqual(release["coverage"]["divisions"]["1"]["stl"], 0)
        self.assertEqual(release["coverage"]["divisions"]["2"]["fta"], 0)
        self.assertEqual(release["coverage"]["teams"], 1)
        self.assertEqual(release["teams"][0]["team_ncaa_id"], 42)
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

    def test_export_promotes_each_source_rank_to_typed_release_field(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO ncaa_players (player_id,division,name,source_stats_json,updated_at) VALUES (?,?,?,?,?)",
            (9, 1, "Ranked Player", '{"fg_pct":{"rank":12,"value":65.4},"dbl_dbl":{"rank":33,"value":8}}', "2026-06-12 23:00:00"),
        )
        release = export_release(conn)
        player = release["players"][0]
        self.assertEqual(player["fg_pct_rank"], 12)
        self.assertEqual(player["dbl_dbl_rank"], 33)

    def test_export_promotes_totals_from_retained_source_rows(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO ncaa_players (player_id,division,name,source_stats_json,updated_at) VALUES (?,?,?,?,?)",
            (
                10,
                2,
                "Complete Player",
                '{"spg":{"cells":["1","Complete Player","Sr.","6-2","G","30","58","1.93"]},'
                '"ast_to":{"cells":["1","Complete Player","Sr.","6-2","G","30","149","70","2.13"]}}',
                "2026-06-12 23:00:00",
            ),
        )
        player = export_release(conn)["players"][0]
        self.assertEqual(player["stl"], 58)
        self.assertEqual(player["ast"], 149)
        self.assertEqual(player["tov"], 70)

    def test_ensure_schema_upgrades_legacy_snapshot(self):
        conn = sqlite3.connect(":memory:")
        legacy_schema = SCHEMA.replace("  source_stats_json TEXT,\n", "")
        conn.executescript(legacy_schema)
        ensure_schema(conn)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(ncaa_players)")}
        self.assertIn("source_stats_json", columns)
        self.assertTrue({"fta", "stl", "blk", "tov", "mins"}.issubset(columns))

    def test_source_totals_promote_every_known_ranking_count(self):
        self.assertEqual(source_totals("spg", ["1", "P", "Sr", "6-2", "G", "30", "58", "1.93"]), {"stl": 58})
        self.assertEqual(source_totals("bpg", ["1", "P", "Sr", "6-9", "F", "30", "44", "1.47"]), {"blk": 44})
        self.assertEqual(source_totals("ft_pct", ["1", "P", "Sr", "6-2", "G", "30", "183", "220", "83.2"]), {"ftm": 183, "fta": 220})
        self.assertEqual(source_totals("ast_to", ["1", "P", "Sr", "6-2", "G", "30", "149", "70", "2.13"]), {"ast": 149, "tov": 70})
        self.assertEqual(source_totals("mpg", ["1", "P", "Sr", "6-2", "G", "30", "1135:22", "37:51"]), {"mins": 1135 + 22 / 60})
        self.assertEqual(source_totals("dbl_dbl", ["1", "P", "Sr", "6-2", "G", "30", "8"]), {})

    def test_assists_uses_current_ncaa_sequence_and_rejects_stale_body(self):
        self.assertEqual(INDIVIDUAL_STATS["140.0"], "apg")
        self.assertEqual(STAT_FALLBACKS["apg"], ("216.0",))
        self.assertNotIn("216.0", INDIVIDUAL_STATS)
        self.assertTrue(invalid_ranking_page("b'Invalid ranking period'"))
        self.assertFalse(invalid_ranking_page("<table><tbody><tr><td>1</td></tr></tbody></table>"))

    def test_sparse_same_season_release_does_not_replace_d1_snapshot(self):
        previous = {
            "season": 2026,
            "coverage": {"divisions": {"1": {"players": 1791, "ppg": 1791, "rpg": 1791, "mpg": 1791}}},
        }
        candidate = {
            "season": 2026,
            "coverage": {"divisions": {"1": {"players": 1496, "ppg": 1496, "rpg": 350, "mpg": 350}}},
        }
        self.assertTrue(release_is_degraded(previous, candidate))

        self.assertTrue(release_is_degraded(previous, {"season": 2026, "coverage": {"divisions": {}}}))

    def test_different_season_is_not_compared_to_previous_snapshot(self):
        previous = {
            "season": 2025,
            "coverage": {"divisions": {"1": {"players": 1791, "ppg": 1791, "rpg": 1791, "mpg": 1791}}},
        }
        candidate = {
            "season": 2026,
            "coverage": {"divisions": {"1": {"players": 1, "ppg": 1, "rpg": 1, "mpg": 1}}},
        }
        self.assertFalse(release_is_degraded(previous, candidate))

    def test_derived_fill_does_not_block_equivalent_source_snapshot(self):
        previous = {
            "season": 2026,
            "coverage": {"divisions": {"1": {"players": 2, "ppg": 2, "rpg": 2, "mpg": 2}}},
            "players": [
                {"division": 1, "source_stats": {"ppg": {}, "rpg": {}, "mpg": {}}},
                {"division": 1, "source_stats": {"ppg": {}}},
            ],
        }
        candidate = {
            "season": 2026,
            "coverage": {"divisions": {"1": {"players": 2, "ppg": 2, "rpg": 1, "mpg": 1}}},
            "players": [
                {"division": 1, "source_stats": {"ppg": {}, "rpg": {}, "mpg": {}}},
                {"division": 1, "source_stats": {"ppg": {}}},
            ],
        }
        self.assertFalse(release_is_degraded(previous, candidate))

    def test_atomic_write_replaces_complete_file_and_leaves_no_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "release.json"
            path.write_text("old\n")
            atomic_write(path, "new\n")
            self.assertEqual(path.read_text(), "new\n")
            self.assertEqual(list(Path(directory).glob(".*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
