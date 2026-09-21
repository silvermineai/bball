import json
import sqlite3
import unittest

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


if __name__ == "__main__":
    unittest.main()
