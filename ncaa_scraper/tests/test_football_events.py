"""Event identities and missing data must survive normalization and refreshes."""

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from ncaa_scraper.football import ROOT, store_rows
from ncaa_scraper.football_events import build, export_sql, leaders_for_rows, normalize


class FootballEventTests(unittest.TestCase):
    def test_missing_fields_are_not_zero_and_source_sign_is_retained(self):
        raw = {
            "game_id": "1",
            "def_pos_team_id": "2",
            "player_name": "Same Name",
            "sacks": "0.5",
            "sacks_yards": "-4",
            "forced_fumbles": "0",
            "interceptions": "NaN",
            "new_column": "unmapped",
        }
        r = normalize(raw, "0", "defense", 2025, {}, {})
        self.assertEqual(r["metrics"]["sacks"], 0.5)
        self.assertEqual(r["metrics"]["sacks_yards"], -4)
        self.assertEqual(r["metrics"]["forced_fumbles"], 0)
        self.assertIsNone(r["metrics"]["interceptions"])
        self.assertIsNone(r["metrics"]["pass_breakups"])
        self.assertEqual(r["raw"], raw)
        self.assertEqual(r["identity_status"], "name_only")
        self.assertEqual(r["context_status"], "missing_game")
        self.assertIsNone(r["game"])

    def test_context_requires_the_source_team_to_play_in_that_game(self):
        game = {"season": 2025, "home_id": "3", "away_id": "4"}
        r = normalize(
            {"game_id": "1", "pos_team_id": "2"},
            "0",
            "specialists",
            2025,
            {"1": game},
            {},
        )
        self.assertEqual(r["context_status"], "team_mismatch")
        self.assertIsNone(r["game"])

    def test_leaders_keep_source_name_and_team_boundaries(self):
        rows = [
            {"player_name": "Same Name", "team_id": "1", "team": "One", "division": "fbs", "game_id": "a", "metrics": {"sacks": 2.0}},
            {"player_name": "Same Name", "team_id": "1", "team": "One", "division": "fbs", "game_id": "b", "metrics": {"sacks": 1.0}},
            {"player_name": "Same Name", "team_id": "2", "team": "Two", "division": "fbs", "game_id": "c", "metrics": {"sacks": 9.0}},
        ]
        leaders = leaders_for_rows(rows, "defense")["sacks"]
        self.assertEqual([(r["team_id"], r["value"], r["games"]) for r in leaders[:2]], [("2", 9.0, 1), ("1", 3.0, 2)])

    def test_edition_refresh_preserves_rows_and_never_merges_a_name(self):
        with tempfile.TemporaryDirectory() as folder:
            source = sqlite3.connect(":memory:")
            source.row_factory = sqlite3.Row
            source.executescript(
                (ROOT / "worker/migrations/0008_football.sql").read_text()
            )
            target = sqlite3.connect(":memory:")
            receipt = {
                "sha256": "a" * 64,
                "fetched_at": "2026-09-05T00:00:00Z",
                "url": "https://example.org/source.csv",
            }
            rows = [
                {
                    "game_id": str(i),
                    "def_pos_team_id": "2",
                    "player_name": "Same Name",
                    "sacks": str(i),
                }
                for i in [1, 2]
            ]
            store_rows(source, "defense", 2025, rows, receipt)
            path = Path(folder) / "index.json"
            first = build(source, target, path)
            before = target.execute("SELECT * FROM football_events").fetchall()
            self.assertEqual(first["editions"][0]["coverage"]["records"], 2)
            self.assertEqual(first["editions"][0]["coverage"]["name_only_records"], 2)
            self.assertEqual(first, build(source, target, path))
            rows[0]["sacks"] = "4"
            store_rows(source, "defense", 2025, rows, {**receipt, "sha256": "b" * 64})
            second = build(source, target, path)
            self.assertNotEqual(
                first["editions"][0]["edition"], second["editions"][0]["edition"]
            )
            self.assertEqual(
                target.execute("SELECT count(*) FROM football_events").fetchone()[0], 4
            )
            self.assertTrue(
                set(before)
                <= set(target.execute("SELECT * FROM football_events").fetchall())
            )
            sql = Path(folder) / "export.sql"
            export_sql(target, sql)
            remote = sqlite3.connect(":memory:")
            remote.executescript(
                (ROOT / "worker/migrations/0014_football_events.sql").read_text()
            )
            remote.executescript(sql.read_text())
            remote.executescript(sql.read_text())
            self.assertEqual(
                remote.execute("SELECT count(*) FROM football_events").fetchone()[0], 4
            )
            self.assertEqual(
                remote.execute("SELECT edition FROM football_event_active").fetchone()[
                    0
                ],
                second["editions"][0]["edition"],
            )
            self.assertEqual(json.loads(path.read_text()), second)


if __name__ == "__main__":
    unittest.main()
