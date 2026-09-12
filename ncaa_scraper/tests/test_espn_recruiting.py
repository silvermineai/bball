import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.espn_recruiting import _fetch, _team_name, sql_export


def release(edition: str, captured_at: str):
    return {
        "season": 2027,
        "edition": edition,
        "captured_at": captured_at,
        "records": [{
            "athlete_id": "42",
            "name": "Ava Example",
            "position": "PG",
            "grade": 80,
            "rank": 12,
            "position_rank": 2,
            "state_rank": 1,
            "region_rank": 3,
            "status": "Undecided",
            "committed_team_id": None,
            "committed_team_name": None,
            "school_ids": [],
            "high_school": "Example High",
            "hometown": "Example, CA",
            "height_inches": 70,
            "weight_pounds": 150,
            "source_url": "https://www.espn.com/college-sports/basketball/recruiting/player/_/id/42",
            "source_sha256": "a" * 64,
        }],
    }


class EspnRecruitingTests(unittest.TestCase):
    def test_fetch_retries_temporary_source_failures(self):
        class Response:
            def __init__(self, status_code, body=b""):
                self.status_code = status_code
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def iter_content(self, chunk_size=0):
                del chunk_size
                yield self.body

        with patch("ncaa_scraper.espn_recruiting.requests.get", side_effect=[Response(503), Response(200, b'{"ok":true}')]) as get, patch("ncaa_scraper.espn_recruiting.time.sleep"):
            value, body = _fetch("https://example.test/recruit")
        self.assertEqual(value, {"ok": True})
        self.assertEqual(body, b'{"ok":true}')
        self.assertEqual(get.call_count, 2)

    def test_team_name_requires_exact_id_and_prefers_display_name(self):
        self.assertEqual(_team_name({"id": "84", "displayName": "Indiana Hoosiers", "name": "Hoosiers"}, "84"), "Indiana Hoosiers")
        self.assertIsNone(_team_name({"id": "84", "displayName": "Indiana Hoosiers"}, "153"))
        self.assertIsNone(_team_name({"id": "84", "displayName": ""}, "84"))

    def test_same_content_capture_updates_clock_without_creating_a_second_row(self):
        db = sqlite3.connect(":memory:")
        db.executescript(sql_export(release("edition-1", "2026-09-12T01:00:00Z")))
        hydrated = release("edition-1", "2026-09-12T02:00:00Z")
        hydrated["records"][0]["committed_team_name"] = "Example University"
        db.executescript(sql_export(hydrated))
        row = db.execute("SELECT count(*), captured_at FROM bb_espn_recruiting").fetchone()
        self.assertEqual(row, (1, "2026-09-12T02:00:00Z"))
        self.assertEqual(db.execute("SELECT committed_team_name FROM bb_espn_recruiting").fetchone()[0], "Example University")
        current = db.execute("SELECT edition, captured_at FROM bb_espn_recruiting_current").fetchone()
        self.assertEqual(current, ("edition-1", "2026-09-12T02:00:00Z"))

    def test_changed_content_keeps_prior_edition_for_rank_comparison(self):
        db = sqlite3.connect(":memory:")
        db.executescript(sql_export(release("edition-1", "2026-09-12T01:00:00Z")))
        changed = release("edition-2", "2026-09-13T01:00:00Z")
        changed["records"][0]["rank"] = 8
        db.executescript(sql_export(changed))
        rows = db.execute("SELECT edition, rank FROM bb_espn_recruiting ORDER BY edition").fetchall()
        self.assertEqual(rows, [("edition-1", 12), ("edition-2", 8)])


if __name__ == "__main__":
    unittest.main()
