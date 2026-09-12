import json
import sqlite3
import unittest

from ncaa_scraper.espn_football_pickcenter import BASE_URL, build_parser, ingest


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
        payload = json.loads(conn.execute("SELECT payload_json FROM audit_markets WHERE market='spreads'").fetchone()[0])
        self.assertEqual(payload["home_id"], GAME["home_id"])


if __name__ == "__main__":
    unittest.main()
