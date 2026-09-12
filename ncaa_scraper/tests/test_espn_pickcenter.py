import json
import sqlite3
import unittest

from ncaa_scraper.espn_pickcenter import BASE_URL, american_to_decimal, build_parser, ingest, parse_pickcenter


GAME = {
    "id": "401900001",
    "home_id": "100",
    "away_id": "200",
    "starts_at": "2026-11-10T02:00:00.000000Z",
    "season": 2027,
    "completed": 0,
    "time_tbd": 0,
}


def summary():
    def close(line, odds):
        return {"close": {"line": line, "odds": odds}}

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
            "total": {"over": close("o155.5", "-105"), "under": close("u155.5", "-115")},
        }],
    }


class EspnPickcenterTests(unittest.TestCase):
    def test_collector_uses_the_verified_public_web_api_host(self):
        self.assertTrue(BASE_URL.startswith("https://site.web.api.espn.com/"))

    def test_cli_defaults_to_the_scheduled_capture_horizon(self):
        self.assertEqual(build_parser().parse_args([]).horizon_days, 60)

    def test_american_conversion_rejects_sentinels(self):
        self.assertAlmostEqual(american_to_decimal("+120"), 2.2)
        self.assertAlmostEqual(american_to_decimal("-140"), 1.7142857)
        with self.assertRaises(ValueError):
            american_to_decimal(0)

    def test_parser_keeps_complete_future_markets_with_exact_identity(self):
        rows = parse_pickcenter(summary(), GAME, "2026-11-09T20:00:00Z", "receipt")
        self.assertEqual([row[1] for row in rows], ["h2h", "spreads", "totals"])
        self.assertEqual(rows[0][0], "Draft Kings")
        self.assertAlmostEqual(rows[0][3]["home_price"], 2.2)
        self.assertEqual(rows[2][3]["line"], 155.5)

    def test_parser_rejects_wrong_start_or_missing_close_quote(self):
        wrong = summary()
        wrong["header"]["competitions"][0]["date"] = "2026-11-10T03:00:00Z"
        with self.assertRaises(ValueError):
            parse_pickcenter(wrong, GAME, "2026-11-09T20:00:00Z", "receipt")
        partial = summary()
        del partial["pickcenter"][0]["total"]["under"]["close"]
        rows = parse_pickcenter(partial, GAME, "2026-11-09T20:00:00Z", "receipt")
        self.assertEqual([row[1] for row in rows], ["h2h", "spreads"])

    def test_ingest_writes_receipt_and_three_rows(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript("""
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
        receipt = {"captured_at": "2026-11-09T20:00:00Z", "sha256": "fixture"}
        result = ingest(self.conn, [{"event_id": GAME["id"], "summary": summary()}], receipt, [GAME], receipt["captured_at"])
        self.assertEqual(result, {"accepted_markets": 3, "rejected_records": 0})
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 1)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 3)
        payload = json.loads(self.conn.execute("SELECT payload_json FROM audit_markets WHERE market='spreads'").fetchone()[0])
        self.assertEqual(payload["event_id"], GAME["id"])


if __name__ == "__main__":
    unittest.main()
