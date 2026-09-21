import sqlite3
import tempfile
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from ncaa_scraper.market_csv import import_rows, read_csv


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
            "2026-11-10T01:01:00Z",
        )
        self.assertEqual(result["accepted_markets"], 1)
        quote = self.conn.execute("SELECT * FROM audit_markets").fetchone()
        self.assertEqual(quote[1:6], ("basketball", "bb-1", "CSV:Licensed Feed", "licensed-book", "spreads"))
        receipt = self.conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0]
        receipt_payload = json.loads(receipt)
        receipt_row = self.conn.execute("SELECT provider FROM audit_receipts").fetchone()
        self.assertEqual(receipt_row[0], "CSV:Licensed Feed")
        self.assertEqual(receipt_payload["source_kind"], "licensed_csv")
        self.assertEqual(receipt_payload["source_rows"], 1)
        self.assertEqual(receipt_payload["accepted_markets"], 1)
        self.assertEqual(receipt_payload["market_status"], "validated_quotes")
        self.assertIn("provider.example/terms", receipt)

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_reimporting_same_snapshot_is_idempotent(self, _schedules):
        kwargs = {
            "conn": self.conn,
            "sport": "basketball",
            "rows": [self.row()],
            "source_sha256": "a" * 64,
            "source_name": "lines.csv",
            "provider": "Licensed Feed",
            "license_url": "https://provider.example/terms",
        }
        first = import_rows(imported_at="2026-11-10T01:01:00Z", **kwargs)
        second = import_rows(imported_at="2026-11-10T01:02:00Z", **kwargs)
        self.assertEqual(first["inserted_markets"], 1)
        self.assertEqual(first["duplicate_markets"], 0)
        self.assertEqual(second["inserted_markets"], 0)
        self.assertEqual(second["duplicate_markets"], 1)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 1)

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_conflicting_snapshot_identity_rolls_back(self, _schedules):
        import_rows(
            self.conn,
            "basketball",
            [self.row()],
            "a" * 64,
            "lines.csv",
            "Licensed Feed",
            "https://provider.example/terms",
            "2026-11-10T01:01:00Z",
        )
        with self.assertRaisesRegex(ValueError, "conflicting quote already exists"):
            import_rows(
                self.conn,
                "basketball",
                [self.row(line="-4.5")],
                "b" * 64,
                "corrected-lines.csv",
                "Licensed Feed",
                "https://provider.example/terms",
                "2026-11-10T01:02:00Z",
            )
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 1)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 1)

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
                "2026-11-10T01:01:00Z",
            )
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 0)

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_import_rejects_future_and_stale_quote_clocks(self, _schedules):
        for row in (
            self.row(captured_at="2026-11-10T01:02:00Z", updated_at="2026-11-10T01:01:00Z"),
            self.row(captured_at="2026-11-10T01:00:00Z", updated_at="2026-11-09T00:59:59Z"),
        ):
            with self.subTest(row=row), self.assertRaises(ValueError):
                import_rows(
                    self.conn,
                    "basketball",
                    [row],
                    "c" * 64,
                    "lines.csv",
                    "Licensed Feed",
                    "https://provider.example/terms",
                    "2026-11-10T01:01:00Z",
                )
            self.assertEqual(
                self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0],
                0,
            )
            self.assertEqual(
                self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0],
                0,
            )

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_import_rejects_provider_update_at_or_after_tip(self, _schedules):
        with self.assertRaisesRegex(ValueError, "updated_at must be before scheduled start"):
            import_rows(
                self.conn,
                "basketball",
                [self.row(updated_at="2026-11-10T02:00:00Z")],
                "e" * 64,
                "lines.csv",
                "Licensed Feed",
                "https://provider.example/terms",
                "2026-11-10T01:01:00Z",
            )
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 0)

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_import_rejects_duplicate_quote_identity_before_writing(self, _schedules):
        with self.assertRaisesRegex(ValueError, "duplicate game/bookmaker/market/capture identity"):
            import_rows(
                self.conn,
                "basketball",
                [self.row(), self.row(line="-4.0")],
                "d" * 64,
                "lines.csv",
                "Licensed Feed",
                "https://provider.example/terms",
                "2026-11-10T01:01:00Z",
            )
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 0)

    @patch("ncaa_scraper.market_csv.schedules", return_value=[GAME])
    def test_import_rejects_nonstandard_american_prices(self, _schedules):
        with self.assertRaisesRegex(ValueError, r"valid \+/-100-or-greater American price"):
            import_rows(
                self.conn,
                "basketball",
                [self.row(home_price="", home_american="-99")],
                "e" * 64,
                "lines.csv",
                "Licensed Feed",
                "https://provider.example/terms",
                "2026-11-10T01:01:00Z",
            )
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_markets").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM audit_receipts").fetchone()[0], 0)

    def test_read_csv_rejects_ambiguous_headers_and_surplus_cells(self):
        with tempfile.TemporaryDirectory() as directory:
            duplicate = Path(directory) / "duplicate.csv"
            duplicate.write_text("game_id,game_id,market\n1,2,spreads\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate headers"):
                read_csv(duplicate)

            surplus = Path(directory) / "surplus.csv"
            surplus.write_text(
                "game_id,market,captured_at,updated_at,home_name,away_name,starts_at\n"
                "1,spreads,2026-11-09T20:00:00Z,2026-11-09T19:59:00Z,Home,Away,2026-11-10T02:00:00Z,extra\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "more cells than the header defines"):
                read_csv(surplus)

    def test_import_requires_a_real_source_digest(self):
        with self.assertRaisesRegex(ValueError, "64-character hexadecimal"):
            import_rows(
                self.conn,
                "basketball",
                [],
                "not-a-digest",
                "lines.csv",
                "Licensed Feed",
                "https://provider.example/terms",
                "2026-11-10T01:01:00Z",
            )

    def test_import_requires_absolute_license_url(self):
        with self.assertRaisesRegex(ValueError, r"absolute http\(s\) URL"):
            import_rows(
                self.conn,
                "basketball",
                [],
                "a" * 64,
                "lines.csv",
                "Licensed Feed",
                "terms",
                "2026-11-10T01:01:00Z",
            )


if __name__ == "__main__":
    unittest.main()
