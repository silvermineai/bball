import gzip
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from bs4 import BeautifulSoup
from ncaa_scraper.brief_archive import ROOT, Capture, pack, sql_insert, verify_pack


class BriefArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "style.css").write_text(
            '@import "https://fonts.example/font;weight";body{color:black}'
        )
        (self.root / "data").mkdir()
        (self.root / "data/test.json").write_text('{"score":12}')
        self.metadata = {
            "sport": "football",
            "game_id": "123",
            "season": 2026,
            "home_name": "Home",
            "away_name": "Away",
            "starts_at": "2026-09-06T12:00:00Z",
            "time_tbd": 0,
            "model_id": "model-1",
            "forecast_generated_at": "2026-09-05T00:00:00Z",
            "original_path": "/blog/game-123/",
        }
        self.raw = b"""<html><head><link rel="stylesheet" href="/style.css"></head><body><main><article class="matchup-brief"><h1>Away at Home</h1><p>model-1: Home by 12</p><a href="/data/test.json" onclick="bad()">Evidence</a><script>bad()</script><a href="javascript:bad()">Bad link</a><section class="brief-notebook"><textarea>Private note</textarea></section><button>Change filter</button></article></main></body></html>"""

    def capture(self, raw=None):
        capture = Capture(self.root)
        version = capture.article(raw or self.raw, self.metadata)
        return capture, version

    def test_reading_view_keeps_text_and_freezes_data_without_scripts_or_notes(self):
        capture, version = self.capture()
        raw = capture.objects[version["revision"]][1]
        soup = BeautifulSoup(raw, "lxml")
        self.assertIn("Home by 12", soup.get_text())
        self.assertNotIn("Private note", soup.get_text())
        self.assertFalse(soup.select("script,textarea,button,select,input,[onclick]"))
        self.assertNotIn("javascript:", raw.decode())
        for digest in json.loads(version["dependencies_json"]):
            self.assertIn(digest, capture.objects)
        data_hash = capture.paths["/data/test.json"]
        (self.root / "data/test.json").write_text('{"score":999}')
        self.assertEqual(json.loads(capture.objects[data_hash][1]), {"score": 12})
        css = capture.objects[capture.paths["/style.css"]][1]
        self.assertNotIn(b"fonts.example", css)
        with self.assertRaises(ValueError):
            capture.asset("/../outside.json")
        with self.assertRaisesRegex(ValueError, "forecast model"):
            self.capture(self.raw.replace(b"model-1", b"model-2"))

    def test_pack_ranges_replay_and_corruption(self):
        capture, _ = self.capture()
        bundle, records = pack(capture, {}, self.root)
        verify_pack(bundle, records)
        data = bundle.read_bytes()
        for record in records:
            raw = gzip.decompress(
                data[
                    record["byte_offset"] : record["byte_offset"]
                    + record["byte_length"]
                ]
            )
            self.assertEqual(raw, capture.objects[record["sha256"]][1])
        self.assertEqual(
            pack(capture, {r["sha256"]: r for r in records}, self.root), (None, [])
        )
        bundle.write_bytes(data + b"wrong")
        with self.assertRaisesRegex(ValueError, "bundle hash"):
            verify_pack(bundle, records)

    def test_old_snapshot_and_observation_time_survive_new_versions_and_removal(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(
            (ROOT / "worker/migrations/0015_brief_archive.sql").read_text()
        )
        capture, version = self.capture()
        _, records = pack(capture, {}, self.root)
        sql = sql_insert("brief_archive_objects", records) + sql_insert(
            "brief_archive_versions", [version]
        )
        db.executescript(sql)
        before = db.execute("SELECT * FROM brief_archive_versions").fetchall()
        db.executescript(sql)
        self.assertEqual(
            before, db.execute("SELECT * FROM brief_archive_versions").fetchall()
        )
        changed, new_version = self.capture(
            self.raw.replace(b"Home by 12", b"Home by 9")
        )
        _, new_records = pack(changed, {}, self.root)
        db.executescript(
            sql_insert("brief_archive_objects", new_records)
            + sql_insert("brief_archive_versions", [new_version])
        )
        self.assertEqual(
            db.execute("SELECT count(*) FROM brief_archive_versions").fetchone()[0], 2
        )
        # An empty future build has no deletion statement.
        db.executescript(sql_insert("brief_archive_versions", []))
        self.assertEqual(
            db.execute(
                "SELECT revision FROM brief_archive_versions ORDER BY sequence DESC LIMIT 1"
            ).fetchone()[0],
            new_version["revision"],
        )
        self.assertEqual(
            before,
            db.execute(
                "SELECT * FROM brief_archive_versions WHERE revision=?",
                (version["revision"],),
            ).fetchall(),
        )


if __name__ == "__main__":
    unittest.main()
