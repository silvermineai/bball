import csv
import hashlib
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from ncaa_scraper.football import store_rows
from ncaa_scraper.football_player_history import (
    KINDS,
    YEARS,
    athlete_board,
    import_history,
    validate_source,
    write_sql,
)
from ncaa_scraper.football_sources import DATASETS, RELEASES, ROOT


class PlayerHistoryTests(unittest.TestCase):
    def fixture(self, directory):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript((ROOT / "worker/migrations/0008_football.sql").read_text())
        downloads = []
        for y in YEARS:
            receipt = {
                "dataset": "schedule",
                "season": y,
                "fetched_at": "2026-09-05T00:00:00Z",
                "sha256": str(y),
            }
            conn.execute(
                "INSERT INTO football_sources VALUES ('schedule',?,?)",
                (y, json.dumps(receipt)),
            )
            conn.execute(
                "INSERT INTO football_games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    str(y),
                    y,
                    f"{y}-09-01T12:00:00Z",
                    "11",
                    "12",
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
            store_rows(
                conn,
                "teams",
                y,
                [{"team_id": "11", "division": "fbs", "short_display_name": "Alpha"}],
                {**receipt, "dataset": "teams"},
            )
            for ds in KINDS:
                if ds == "box":
                    row = {
                        "athlete_id": "100",
                        "team_id": "11",
                        "athlete_name": "Actual Player",
                        "game_id": str(y),
                        "category": "passing",
                        "season": str(y),
                        "stat_5": "0",
                    }
                    rows = [row, {**row, "athlete_id": "-100", "athlete_name": " Team"}]
                elif ds in ("passing", "rushing", "receiving"):
                    row = {
                        "player_id": "100",
                        "team_id": "11",
                        f"{ds[:-3] if ds != 'receiving' else 'receiver'}_player_name": "Actual Player",
                        "season": str(y),
                        "plays": "120",
                        "TEPA": "-1",
                        "EPAplay": "-0.01",
                        "yards": "50",
                        "division": "fbs",
                    }
                    rows = [
                        row,
                        {
                            **row,
                            "player_id": "-100",
                            next(k for k in row if k.endswith("player_name")): "TEAM",
                            "TEPA": "20",
                        },
                    ]
                else:
                    rows = [
                        {
                            "def_pos_team_id"
                            if ds == "defense"
                            else "pos_team_id": "11",
                            "player_name": "Named Event",
                            "game_id": str(y),
                            "season": str(y),
                        }
                    ]
                tag, pattern = DATASETS[ds]
                filename = pattern.format(year=y)
                stream = io.StringIO()
                writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
                payload = stream.getvalue().encode()
                (directory / filename).write_bytes(payload)
                receipt = {
                    "dataset": ds,
                    "season": y,
                    "fetched_at": "2026-09-05T00:00:00Z",
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "url": f"{RELEASES}/{tag}/{filename}",
                }
                downloads.append((ds, y, rows, receipt))
        conn.execute(
            "INSERT INTO football_models VALUES ('fixed','clock','cutoff','{}')"
        )
        conn.commit()
        return conn, downloads

    def test_complete_release_retains_raw_placeholders_but_excludes_them_from_rankings(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            conn, downloads = self.fixture(root)
            out = root / "public"
            local = root / "sql"
            result = import_history(conn, downloads, out, local, cache=root)
            self.assertEqual(len(result["sources"]), len(KINDS) * len(YEARS))
            self.assertEqual(
                conn.execute("SELECT count(*) FROM football_models").fetchone()[0], 1
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM football_stats WHERE athlete_id='-100'"
                ).fetchone()[0],
                4 * len(YEARS),
            )
            for year in YEARS:
                board = athlete_board(conn, year)
                self.assertEqual([p["id"] for p in board["players"]], ["100"])
                self.assertEqual(board["excluded_team_placeholder_entries"], 1)
                self.assertEqual(
                    board["players"][0]["production"]["passing"]["rank"], 1
                )
                self.assertEqual(board["rankings"]["passing"]["qualified"], 1)
            # Each bounded source SQL file replays exactly into the same schema.
            target = sqlite3.connect(":memory:")
            target.executescript(
                (ROOT / "worker/migrations/0008_football.sql").read_text()
            )
            for source in result["sources"]:
                target.executescript((local / source["sql"]).read_text())
            for ds in KINDS:
                expected = [
                    tuple(r)
                    for r in conn.execute(
                        "SELECT * FROM football_stats WHERE dataset=? ORDER BY season,record_key",
                        (ds,),
                    )
                ]
                self.assertEqual(
                    expected,
                    target.execute(
                        "SELECT * FROM football_stats WHERE dataset=? ORDER BY season,record_key",
                        (ds,),
                    ).fetchall(),
                )
            self.assertEqual(
                json.loads((out / "player-catalog.json").read_text())["seasons"][0][
                    "team_placeholder_box_rows"
                ],
                1,
            )
            target.close()
            conn.close()

    def test_invalid_download_never_changes_warehouse(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            conn, downloads = self.fixture(root)
            before = conn.total_changes
            _, _, rows, _ = downloads[-1]
            rows[0]["game_id"] = "999999"
            with self.assertRaisesRegex(ValueError, "mismatch"):
                import_history(
                    conn, downloads, root / "public", root / "sql", cache=root
                )
            self.assertEqual(conn.total_changes, before)
            self.assertFalse((root / "public").exists())
            with self.assertRaises(ValueError):
                import_history(
                    conn, downloads[:-1], root / "public", root / "sql", cache=root
                )
            conn.close()

    def test_receipts_identities_duplicates_and_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            conn, downloads = self.fixture(root)
            ds, y, rows, receipt = downloads[0]
            games = {
                r["id"]: dict(r) for r in conn.execute("SELECT * FROM football_games")
            }
            validate_source(ds, y, rows, receipt, games, {"11"}, cache=root)
            for changed in [
                [*rows, rows[0]],
                [{**rows[0], "athlete_id": "-100", "athlete_name": "A real person"}],
                [{**rows[0], "season": "2021"}],
                [{**rows[0], "team_id": "12"}],
            ]:
                with self.assertRaises(ValueError):
                    validate_source(ds, y, changed, receipt, games, {"11"}, cache=root)
            with self.assertRaises(ValueError):
                validate_source(
                    ds, y, rows, {**receipt, "sha256": "bad"}, games, {"11"}, cache=root
                )
            with self.assertRaises(ValueError):
                write_sql(conn, root / "bad.sql", "box", 2025)
            with self.assertRaises(ValueError):
                write_sql(conn, root / "bad.sql", "schedule", 2022)
            conn.close()


if __name__ == "__main__":
    unittest.main()
