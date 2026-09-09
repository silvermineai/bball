import sqlite3
import unittest
from unittest.mock import patch

from ncaa_scraper.market_csv import import_rows


GAME = {
    "id": "bb-1",
    "season": 2027,
    "home_id": "home-1",
    "away_id": "away-1",
    "home_name": "Home State",
    "away_name": "Away State",
    "starts_at": "2026-11-10T02:00:00.000000Z",
    "completed": 0,
    "time_tbd": 0,
}


class MarketCsvTests(unittest.TestCase):
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

    def row(self, **overrides):
        return {
            "game_id": "bb-1",
            "market": "spreads",
            "captured_at": "2026-11-09T20:00:00-05:00",
            "updated_at": "2026-11-09T19:59:00-05:00",
            "home_name": "Home State",
            "away_name": "Away State",
            "starts_at": "2026-11-10T02:00:00Z",
            "bookmaker": "licensed-book",
            "line": "-3.5",
            "home_price": "1.91",
            "away_price": "1.91",
            **overrides,
        }

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_import_requires_exact_game_and_retains_receipt(self, _schedules):
        result = import_rows(
            self.conn,
            "basketball",
            [self.row()],
            "a" * 64,
            "lines.csv",
            "Licensed Feed",
            "https://provider.example/terms",
            "2026-11-09T20:01:00Z",
        )
        self.assertEqual(result["accepted_markets"], 1)
        quote = self.conn.execute("SELECT * FROM audit_markets").fetchone()
        self.assertEqual(quote[1:6], ("basketball", "bb-1", "CSV:Licensed Feed", "licensed-book", "spreads"))
        receipt = self.conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0]
        self.assertIn("provider.example/terms", receipt)

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_rejected_row_rolls_back_all_market_rows(self, _schedules):
        with self.assertRaises(ValueError):
            import_rows(
                self.conn,
                "basketball",
                [self.row(home_name="A near match")],
                "b" * 64,
                "lines.csv",
                "Licensed Feed",
                "https://provider.example/terms",
                "2026-11-09T20:01:00Z",
            )
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
