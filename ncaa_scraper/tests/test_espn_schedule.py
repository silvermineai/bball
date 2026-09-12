import json
import sqlite3
import unittest

from ncaa_scraper.espn_schedule import build_parser, ingest, validate_event


GAME = {
    "id": "401900001",
    "home_id": "100",
    "away_id": "200",
    "starts_at": "2026-11-10T02:00:00.000000Z",
    "season": 2027,
    "completed": 0,
    "time_tbd": 1,
}


def event(start="2026-11-10T02:00:00Z", valid=False):
    return {
        "id": GAME["id"],
        "season": {"year": 2027},
        "date": start,
        "competitions": [{
            "id": GAME["id"],
            "date": start,
            "timeValid": valid,
            "competitors": [
                {"id": GAME["home_id"], "homeAway": "home"},
                {"id": GAME["away_id"], "homeAway": "away"},
            ],
        }],
    }


class EspnScheduleTests(unittest.TestCase):
    def test_cli_defaults_to_bounded_clock_horizon(self):
        args = build_parser().parse_args([])
        self.assertEqual(args.horizon_days, 60)
        self.assertEqual(args.limit_dates, 90)

    def test_exact_ids_and_calendar_day_are_required(self):
        row = validate_event(event("2026-11-10T18:30:00Z", True), GAME)
        self.assertEqual(row["source_start"], "2026-11-10T18:30:00.000000Z")
        self.assertTrue(row["source_time_valid"])
        wrong = event()
        wrong["competitions"][0]["competitors"][1]["id"] = "999"
        with self.assertRaises(ValueError):
            validate_event(wrong, GAME)
        with self.assertRaises(ValueError):
            validate_event(event("2026-11-11T02:00:00Z"), GAME)

    def test_confirmed_canonical_row_rejects_changed_source_instant(self):
        confirmed = {**GAME, "time_tbd": 0}
        with self.assertRaises(ValueError):
            validate_event(event("2026-11-10T18:30:00Z", True), confirmed)

    def test_ingest_keeps_only_bounded_identity_payload(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript("""
            CREATE TABLE audit_schedule_times (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
              provider TEXT NOT NULL, observed_at TEXT NOT NULL, source_start TEXT NOT NULL,
              source_time_valid INTEGER NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_receipts (
              id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
            CREATE TABLE audit_unmatched (
              id TEXT PRIMARY KEY, sport TEXT NOT NULL, event_id TEXT NOT NULL,
              captured_at TEXT NOT NULL, reason TEXT NOT NULL, payload_json TEXT NOT NULL
            );
        """)
        receipt = {"captured_at": "2026-11-09T20:00:00Z", "sha256": "fixture"}
        result = ingest(conn, [{"event": event("2026-11-10T18:30:00Z", True), "url": "https://example.test"}], receipt, [GAME])
        self.assertEqual(result, {"accepted_observations": 1, "rejected_records": 0})
        payload = json.loads(conn.execute("SELECT payload_json FROM audit_schedule_times").fetchone()[0])
        self.assertEqual(payload["event_id"], GAME["id"])
        self.assertNotIn("competitions", payload)


if __name__ == "__main__":
    unittest.main()
