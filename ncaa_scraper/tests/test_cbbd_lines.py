import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.cbbd_lines import fetch_lines, ingest


GAME = {
    "id": "bb-1",
    "home_id": "home-1",
    "away_id": "away-1",
    "starts_at": "2026-11-10T02:00:00.000000Z",
    "completed": 0,
    "time_tbd": 0,
    "home_aliases": {"home state"},
    "away_aliases": {"away state"},
}


class CbbdLinesTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript(
            """
            CREATE TABLE audit_markets (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
              provider TEXT NOT NULL, bookmaker TEXT NOT NULL, market TEXT NOT NULL,
              captured_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_receipts (
              id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
            """
        )

    def tearDown(self):
        self.conn.close()

    def test_fetch_is_key_gated_and_preserves_receipt(self):
        with patch("ncaa_scraper.cbbd_lines.api_key", return_value=None), patch(
            "ncaa_scraper.cbbd_lines.fetch_json"
        ) as fetch:
            with self.assertRaisesRegex(RuntimeError, "no provider call"):
                fetch_lines(2027)
            fetch.assert_not_called()

    def test_ingest_accepts_future_moneyline_and_rejects_started_game(self):
        rows = [
            {
                "gameId": 44,
                "startDate": "2026-11-10T02:00:00Z",
                "homeTeam": "Home State",
                "awayTeam": "Away State",
                "lines": [{"provider": "consensus", "homeMoneyline": -145, "awayMoneyline": 125}],
            },
            {
                "gameId": 45,
                "startDate": "2026-11-09T02:00:00Z",
                "homeTeam": "Home State",
                "awayTeam": "Away State",
                "lines": [{"provider": "consensus", "homeMoneyline": -145, "awayMoneyline": 125}],
            },
        ]
        result = ingest(
            self.conn,
            rows,
            {
                "captured_at": "2026-11-09T20:00:00Z",
                "license_url": "https://collegebasketballdata.com/terms",
            },
            [GAME],
            "2026-11-09T20:00:00Z",
        )
        self.assertEqual(result, {"accepted_markets": 1, "rejected_records": 1})
        quote = self.conn.execute("SELECT provider,bookmaker,market,payload_json FROM audit_markets").fetchone()
        self.assertEqual(quote[:3], ("CollegeBasketballData.com API", "consensus", "h2h"))
        self.assertAlmostEqual(__import__("json").loads(quote[3])["home_price"], 1.689655, places=5)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
