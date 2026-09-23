import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ncaa_scraper import espn_football_pickcenter as collector
from ncaa_scraper.espn_football_pickcenter import BASE_URL, build_parser, ingest, parse_football_pickcenter


GAME = {
    "id": "401900002",
    "home_id": "100",
    "away_id": "200",
    "starts_at": "2026-09-20T19:00:00.000000Z",
    "season": 2026,
    "completed": 0,
    "time_tbd": 0,
}


def summary():
    def close(line, odds):
        item = {"odds": odds}
        if line is not None:
            item["line"] = line
        return {"close": item}

    return {
        "header": {
            "id": GAME["id"],
            "competitions": [{
                "id": GAME["id"],
                "date": GAME["starts_at"],
                "competitors": [
                    {"id": GAME["home_id"], "homeAway": "home"},
                    {"id": GAME["away_id"], "homeAway": "away"},
                ],
            }],
        },
        "pickcenter": [{
            "provider": {"name": "Draft Kings"},
            "moneyline": {"home": close(None, "+120"), "away": close(None, "-140")},
            "pointSpread": {"home": close("+3.5", "-110"), "away": close("-3.5", "-110")},
            "total": {"over": close("o43.5", "-105"), "under": close("u43.5", "-115")},
        }],
    }


def flattened_summary():
    """Current ESPN football summaries publish this shape, unlike basketball."""
    return {
        "header": {
            "id": GAME["id"],
            "competitions": [{
                "id": GAME["id"],
                "date": GAME["starts_at"],
                "competitors": [
                    {"id": GAME["home_id"], "homeAway": "home"},
                    {"id": GAME["away_id"], "homeAway": "away"},
                ],
            }],
        },
        "pickcenter": [{
            "provider": {"name": "Draft Kings"},
            "spread": -3.5,
            "overUnder": 43.5,
            "overOdds": -105,
            "underOdds": -115,
            "homeTeamOdds": {"teamId": GAME["home_id"], "moneyLine": -140, "spreadOdds": -110},
            "awayTeamOdds": {"teamId": GAME["away_id"], "moneyLine": 120, "spreadOdds": -110},
        }],
    }


class EspnFootballPickcenterTests(unittest.TestCase):
    def test_public_endpoint_and_capture_defaults(self):
        self.assertIn("football/college-football/summary", BASE_URL)
        self.assertEqual(build_parser().parse_args([]).season, 2026)

    def test_ingest_keeps_exact_future_markets_in_football_namespace(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE audit_markets (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
              provider TEXT NOT NULL, bookmaker TEXT NOT NULL, market TEXT NOT NULL,
              captured_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_receipts (
              id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
        """)
        receipt = {"captured_at": "2026-09-19T20:00:00Z", "sha256": "fixture"}
        result = ingest(conn, [{"event_id": GAME["id"], "summary": summary()}], receipt, [GAME], receipt["captured_at"])
        self.assertEqual(result, {"accepted_markets": 3, "rejected_records": 0})
        self.assertEqual(conn.execute("SELECT DISTINCT sport FROM audit_markets").fetchone()[0], "football")
        receipt_payload = json.loads(conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0])
        self.assertEqual(receipt_payload["summary_count"], 1)
        self.assertEqual(receipt_payload["summary_with_pickcenter"], 1)
        self.assertEqual(receipt_payload["accepted_markets"], 3)
        self.assertEqual(receipt_payload["rejected_records"], 0)
        payload = json.loads(conn.execute("SELECT payload_json FROM audit_markets WHERE market='spreads'").fetchone()[0])
        self.assertEqual(payload["home_id"], GAME["home_id"])

    def test_ingest_accepts_current_flattened_football_pickcenter_shape(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE audit_markets (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
              provider TEXT NOT NULL, bookmaker TEXT NOT NULL, market TEXT NOT NULL,
              captured_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_receipts (
              id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
        """)
        receipt = {"captured_at": "2026-09-19T20:00:00Z", "sha256": "fixture"}
        rows = parse_football_pickcenter(flattened_summary(), GAME, receipt["captured_at"], "receipt")
        self.assertEqual([row[1] for row in rows], ["h2h", "spreads", "totals"])
        result = ingest(conn, [{"event_id": GAME["id"], "summary": flattened_summary()}], receipt, [GAME], receipt["captured_at"])
        self.assertEqual(result, {"accepted_markets": 3, "rejected_records": 0})
        self.assertEqual(conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 3)
        payload = json.loads(conn.execute("SELECT payload_json FROM audit_markets WHERE market='totals'").fetchone()[0])
        self.assertEqual(payload["line"], 43.5)

    def test_flattened_shape_rejects_mismatched_pick_team_ids(self):
        payload = flattened_summary()
        payload["pickcenter"][0]["homeTeamOdds"]["teamId"] = "999"
        with self.assertRaises(ValueError):
            parse_football_pickcenter(payload, GAME, "2026-09-19T20:00:00Z", "receipt")

    def test_ingest_records_partial_capture_when_summary_requests_fail(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE audit_markets (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
              provider TEXT NOT NULL, bookmaker TEXT NOT NULL, market TEXT NOT NULL,
              captured_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_receipts (
              id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
        """)
        receipt = {
            "captured_at": "2026-09-19T20:00:00Z",
            "sha256": "failed-capture",
            "eligible_games": 2,
            "summary_fetch_failures": 2,
            "summary_count": 0,
            "summary_with_pickcenter": 0,
        }
        result = ingest(conn, [], receipt, [GAME, {**GAME, "id": "401900003"}], receipt["captured_at"])
        self.assertEqual(result, {"accepted_markets": 0, "rejected_records": 0})
        payload = json.loads(conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0])
        self.assertEqual(payload["eligible_games"], 2)
        self.assertEqual(payload["summary_fetch_failures"], 2)
        self.assertEqual(payload["market_status"], "capture_incomplete")

    def test_fetch_upcoming_counts_http_failures_against_eligible_games(self):
        class FailedResponse:
            status_code = 503

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        games = [GAME, {**GAME, "id": "401900003"}]
        with tempfile.TemporaryDirectory() as directory, \
            patch.object(collector, "schedules", return_value=games), \
            patch.object(collector, "_future_games", return_value=games), \
            patch.object(collector, "verify_robots_policy", return_value={"robots_url": "https://site.web.api.espn.com/robots.txt", "robots_status": 200, "robots_sha256": "a" * 64, "crawl_delay_seconds": None}), \
            patch.object(collector.requests, "get", return_value=FailedResponse()), \
            patch.object(collector.time, "sleep"), \
            patch.object(collector, "CACHE", Path(directory)):
            summaries, receipt = collector.fetch_upcoming(season=2026, horizon_days=30, limit=2)
        self.assertEqual(summaries, [])
        self.assertEqual(receipt["eligible_games"], 2)
        self.assertEqual(receipt["summary_fetch_failures"], 2)
        self.assertEqual(receipt["summary_count"], 0)

    def test_ingest_uses_item_clock_to_reject_a_post_tip_summary(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE audit_markets (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
              provider TEXT NOT NULL, bookmaker TEXT NOT NULL, market TEXT NOT NULL,
              captured_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_receipts (
              id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
        """)
        receipt = {"captured_at": "2026-09-19T20:00:00Z", "sha256": "fixture"}
        item = {"event_id": GAME["id"], "summary": summary(), "captured_at": "2026-09-20T19:00:01Z"}
        result = ingest(conn, [item], receipt, [GAME], receipt["captured_at"])
        self.assertEqual(result, {"accepted_markets": 0, "rejected_records": 1})
        self.assertEqual(conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
