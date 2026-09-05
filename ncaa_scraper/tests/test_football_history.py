import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from ncaa_scraper.football_efficiency import season_release
from ncaa_scraper.football_history import (
    YEARS,
    import_history,
    validate_download,
    write_source_sql,
)
from ncaa_scraper.football_sources import DATASETS, RELEASES, ROOT


class HistoricalTests(unittest.TestCase):
    def database(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript((ROOT / "worker/migrations/0008_football.sql").read_text())
        for year in YEARS:
            conn.execute(
                "INSERT INTO football_sources VALUES ('schedule',?,?)",
                (
                    year,
                    json.dumps(
                        {"dataset": "schedule", "season": year, "sha256": str(year)}
                    ),
                ),
            )
            conn.execute(
                "INSERT INTO football_games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    str(year),
                    year,
                    f"{year}-09-01T12:00:00Z",
                    "a",
                    "b",
                    "Alpha",
                    "Beta",
                    "one",
                    "two",
                    "fbs",
                    "fbs",
                    21,
                    7,
                    1,
                    0,
                    1,
                    "Stadium",
                    0,
                    "{}",
                ),
            )
        conn.execute(
            "INSERT INTO football_models VALUES ('model','clock','cutoff','{}')"
        )
        conn.commit()
        return conn

    def inputs(self):
        rows = []
        for year in YEARS:
            directory = [
                {
                    "team_id": t,
                    "season": str(year),
                    "division": "fbs",
                    "short_display_name": t,
                }
                for t in ("a", "b")
            ]
            advanced = [
                {
                    "game_id": str(year),
                    "pos_team_id": t,
                    "pos_team": t,
                    "season": str(year),
                    "EPA_overall_off": "5",
                    "scrimmage_plays": "50",
                }
                for t in ("a", "b")
            ]
            for ds, data in [("teams", directory), ("team_advanced", advanced)]:
                rows.append(
                    (
                        ds,
                        year,
                        data,
                        {
                            "dataset": ds,
                            "season": year,
                            "sha256": ds + str(year),
                            "fetched_at": "2026-09-05T00:00:00Z",
                        },
                    )
                )
        return rows

    def test_bad_game_identity_and_incomplete_release_do_not_mutate_sources(self):
        conn = self.database()
        before = list(conn.iterdump())
        data = self.inputs()
        data[-1][2][0]["pos_team_id"] = "stranger"
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, "identity"):
                import_history(conn, data, Path(d) / "out", Path(d) / "local")
            with self.assertRaisesRegex(ValueError, "six"):
                import_history(
                    conn, self.inputs()[:-1], Path(d) / "out", Path(d) / "local"
                )
        self.assertEqual(list(conn.iterdump()), before)
        conn.close()

    def test_scoped_import_sql_replay_and_repeat_preserve_forecasts(self):
        conn = self.database()
        games = [tuple(r) for r in conn.execute("SELECT * FROM football_games")]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "out"
            local = Path(d) / "local"
            manifest = import_history(conn, self.inputs(), out, local)
            remote = self.database()
            for s in manifest["sources"]:
                sql = (local / s["sql"]).read_text()
                self.assertNotIn("DELETE FROM football_games", sql)
                remote.executescript(sql)
                remote.executescript(sql)
            for table in (
                "football_stats",
                "football_sources",
                "football_models",
                "football_games",
            ):
                self.assertEqual(
                    [
                        tuple(r)
                        for r in conn.execute(f"SELECT * FROM {table} ORDER BY 1,2")
                    ],
                    [
                        tuple(r)
                        for r in remote.execute(f"SELECT * FROM {table} ORDER BY 1,2")
                    ],
                )
            again = import_history(conn, self.inputs(), out, local)
            self.assertEqual(manifest, again)
            self.assertEqual(
                [tuple(r) for r in conn.execute("SELECT * FROM football_games")], games
            )
            self.assertEqual(
                conn.execute("SELECT created_at FROM football_models").fetchone()[0],
                "clock",
            )
            with self.assertRaises(ValueError):
                write_source_sql(conn, local / "bad.sql", "box", 2025)
            remote.close()
        conn.close()

    def test_cache_hash_and_season_are_verified(self):
        with tempfile.TemporaryDirectory() as d:
            cache = Path(d)
            ds = "teams"
            year = 2022
            tag, pattern = DATASETS[ds]
            name = pattern.format(year=year)
            (cache / name).write_bytes(b"test")
            receipt = {
                "dataset": ds,
                "season": year,
                "url": f"{RELEASES}/{tag}/{name}",
                "sha256": hashlib.sha256(b"test").hexdigest(),
            }
            rows = [{"team_id": "1", "season": "2022"}]
            self.assertEqual(validate_download(ds, year, rows, receipt, cache), name)
            with self.assertRaisesRegex(ValueError, "duplicate"):
                validate_download(ds, year, rows * 2, receipt, cache)
            rows[0]["season"] = "2023"
            with self.assertRaisesRegex(ValueError, "mixed-season"):
                validate_download(ds, year, rows, receipt, cache)
            (cache / name).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "mismatch"):
                validate_download(ds, year, rows, receipt, cache)

    def test_directory_fbs_label_does_not_reclassify_an_unknown_schedule_squad(self):
        conn = self.database()
        games = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM football_games")}
        games["2022"]["home_division"] = ""
        rows = self.inputs()[1][2]
        profiles = season_release(
            rows, games, {"a": {"division": "fbs"}, "b": {"division": "fcs"}}, 2022
        )
        divisions = {p["id"]: p["division"] for p in profiles}
        self.assertEqual(divisions, {"a": "unknown", "b": "fbs"})
        conn.close()


if __name__ == "__main__":
    unittest.main()
