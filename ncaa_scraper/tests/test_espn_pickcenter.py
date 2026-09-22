import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from ncaa_scraper import espn_pickcenter as collector
from ncaa_scraper.espn_pickcenter import BASE_URL, DEFAULT_CAPTURE_LIMIT, _future_games, american_to_decimal, build_parser, ingest, parse_pickcenter, summary_capture_counts, summary_capture_diagnostics
from ncaa_scraper.odds_feed import schedules


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
        self.assertEqual(build_parser().parse_args([]).horizon_days, 90)
        self.assertEqual(build_parser().parse_args([]).limit, DEFAULT_CAPTURE_LIMIT)
        self.assertEqual(DEFAULT_CAPTURE_LIMIT, 300)

    def test_capture_counts_distinguish_empty_pickcenter_summaries(self):
        self.assertEqual(summary_capture_counts([
            {"event_id": "one", "summary": {"pickcenter": []}},
            {"event_id": "two", "summary": summary()},
            {"event_id": "three", "summary": {}},
        ]), (3, 1))

    def test_bounded_capture_receipt_reports_unrequested_candidates(self):
        class FailedResponse:
            status_code = 503

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        candidates = [
            {**GAME, "id": "401900001"},
            {**GAME, "id": "401900002"},
            {**GAME, "id": "401900003"},
        ]
        with patch.object(collector, "schedules", return_value=candidates), patch.object(
            collector, "_future_games", return_value=candidates
        ), patch.object(collector.requests, "get", return_value=FailedResponse()), patch.object(
            collector.time, "sleep"
        ), patch.object(collector, "CACHE", Path(".local/test-market-cache")):
            summaries, receipt = collector.fetch_upcoming(
                season=2027, horizon_days=30, limit=2
            )
        self.assertEqual(summaries, [])
        self.assertEqual(receipt["eligible_games"], 2)
        self.assertEqual(receipt["candidate_games"], 3)
        self.assertEqual(receipt["capture_limit"], 2)
        self.assertTrue(receipt["capture_truncated"])

    def test_capture_diagnostics_separate_odds_payloads_from_complete_quotes(self):
        with_odds = {"event_id": "one", "summary": {"pickcenter": [], "odds": [{"provider": {"name": "A book"}}]}}
        self.assertEqual(summary_capture_diagnostics([with_odds, {"event_id": "two", "summary": summary()}]), {
            "summary_count": 2,
            "summary_with_pickcenter": 1,
            "summary_with_odds": 1,
        })

    def test_american_conversion_rejects_sentinels(self):
        self.assertAlmostEqual(american_to_decimal("+120"), 2.2)
        self.assertAlmostEqual(american_to_decimal("-140"), 1.7142857)
        for value in (0, "+25", "-99", "NaN", "OFF"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                american_to_decimal(value)

    def test_parser_keeps_complete_future_markets_with_exact_identity(self):
        rows = parse_pickcenter(summary(), GAME, "2026-11-09T20:00:00Z", "receipt")
        self.assertEqual([row[1] for row in rows], ["h2h", "spreads", "totals"])
        self.assertEqual(rows[0][0], "Draft Kings")
        self.assertAlmostEqual(rows[0][3]["home_price"], 2.2)
        self.assertEqual(rows[2][3]["line"], 155.5)

    def test_parser_accepts_exact_source_clock_for_canonical_tbd_game(self):
        game = {
            **GAME,
            "starts_at": "2026-11-10T05:00:00.000000Z",
            "time_tbd": 1,
        }
        payload = summary()
        payload["header"]["competitions"][0]["date"] = "2026-11-10T23:00:00Z"
        payload["header"]["timeValid"] = True
        rows = parse_pickcenter(payload, game, "2026-11-09T20:00:00Z", "receipt")
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][3]["starts_at"], "2026-11-10T23:00:00.000000Z")
        self.assertTrue(rows[0][3]["canonical_time_tbd"])
        self.assertTrue(rows[0][3]["source_time_valid"])

    def test_parser_rejects_tbd_game_when_source_clock_is_not_confirmed(self):
        game = {
            **GAME,
            "starts_at": "2026-11-10T05:00:00.000000Z",
            "time_tbd": 1,
        }
        payload = summary()
        payload["header"]["competitions"][0]["date"] = "2026-11-10T23:00:00Z"
        with self.assertRaisesRegex(ValueError, "not confirmed"):
            parse_pickcenter(payload, game, "2026-11-09T20:00:00Z", "receipt")

    def test_future_capture_candidates_include_tbd_rows_for_source_clock_check(self):
        game = {**GAME, "time_tbd": 1}
        selected = _future_games(
            [game],
            2027,
            90,
            datetime(2026, 11, 9, 20, tzinfo=timezone.utc),
        )
        self.assertEqual([row["id"] for row in selected], [GAME["id"]])

    def test_parser_rejects_wrong_start_or_missing_close_quote(self):
        wrong = summary()
        wrong["header"]["competitions"][0]["date"] = "2026-11-10T03:00:00Z"
        with self.assertRaises(ValueError):
            parse_pickcenter(wrong, GAME, "2026-11-09T20:00:00Z", "receipt")
        partial = summary()
        del partial["pickcenter"][0]["total"]["under"]["close"]
        rows = parse_pickcenter(partial, GAME, "2026-11-09T20:00:00Z", "receipt")
        self.assertEqual([row[1] for row in rows], ["h2h", "spreads"])

    def test_parser_keeps_lines_when_moneyline_is_off(self):
        partial = summary()
        partial["pickcenter"][0]["moneyline"]["home"]["close"]["odds"] = "OFF"
        partial["pickcenter"][0]["moneyline"]["away"]["close"]["odds"] = "OFF"
        rows = parse_pickcenter(partial, GAME, "2026-11-09T20:00:00Z", "receipt")
        self.assertEqual([row[1] for row in rows], ["spreads", "totals"])

    def test_schedule_matching_can_use_published_overview_during_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "frontend/public/data/basketball"
            target.mkdir(parents=True)
            (target / "overview.json").write_text(json.dumps({"upcoming": [
                {
                    "id": GAME["id"],
                    "starts_at": GAME["starts_at"],
                    "home_id": GAME["home_id"],
                    "away_id": GAME["away_id"],
                    "home_name": "Home University",
                    "away_name": "Away University",
                    "completed": 0,
                    "time_tbd": 0,
                }
            ]}))
            with patch("ncaa_scraper.odds_feed.ROOT", root):
                games = schedules("basketball")
            self.assertEqual(len(games), 1)
            self.assertEqual(games[0]["home_aliases"], {"home university"})

    def test_schedule_matching_uses_overview_when_compact_db_has_no_games(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local = root / ".local"
            local.mkdir()
            database = sqlite3.connect(local / "basketball.sqlite3")
            database.executescript("CREATE TABLE bb_rosters (team_id TEXT); CREATE TABLE bb_games (id TEXT);")
            database.close()
            target = root / "frontend/public/data/basketball"
            target.mkdir(parents=True)
            (target / "overview.json").write_text(json.dumps({"upcoming": [
                {
                    "id": GAME["id"],
                    "starts_at": GAME["starts_at"],
                    "home_id": GAME["home_id"],
                    "away_id": GAME["away_id"],
                    "home_name": "Home University",
                    "away_name": "Away University",
                    "completed": 0,
                    "time_tbd": 0,
                }
            ]}))
            with patch("ncaa_scraper.odds_feed.ROOT", root):
                games = schedules("basketball")
            self.assertEqual(len(games), 1)
            self.assertEqual(games[0]["away_aliases"], {"away university"})

    def test_schedule_matching_falls_back_when_basketball_database_is_incomplete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local = root / ".local"
            local.mkdir()
            # A failed refresh can leave a readable SQLite file without the
            # canonical tables. The public schedule remains the safe matching
            # source until the warehouse is rebuilt.
            database = sqlite3.connect(local / "basketball.sqlite3")
            database.execute("CREATE TABLE refresh_marker (id TEXT)")
            database.close()
            target = root / "frontend/public/data/basketball"
            target.mkdir(parents=True)
            (target / "overview.json").write_text(json.dumps({"upcoming": [
                {
                    "id": GAME["id"],
                    "starts_at": GAME["starts_at"],
                    "home_id": GAME["home_id"],
                    "away_id": GAME["away_id"],
                    "home_name": "Home University",
                    "away_name": "Away University",
                    "completed": 0,
                    "time_tbd": 0,
                }
            ]}))
            with patch("ncaa_scraper.odds_feed.ROOT", root):
                games = schedules("basketball")
            self.assertEqual(len(games), 1)
            self.assertEqual(games[0]["home_aliases"], {"home university"})

    def test_football_schedule_falls_back_when_rebuild_left_empty_database(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local = root / ".local"
            local.mkdir()
            # sqlite can open a zero-byte file, so this exercises the same
            # interrupted-refresh state that previously raised no-such-table.
            (local / "football.sqlite3").touch()
            target = root / "frontend/public/data/football"
            target.mkdir(parents=True)
            (target / "overview.json").write_text(json.dumps({"upcoming": [
                {
                    "id": "401900002",
                    "kickoff": "2026-09-20T18:00:00.000Z",
                    "season": 2026,
                    "home_id": "100",
                    "away_id": "200",
                    "home_name": "Home University",
                    "away_name": "Away University",
                    "completed": 0,
                    "time_tbd": 0,
                }
            ]}))
            with patch("ncaa_scraper.odds_feed.ROOT", root):
                games = schedules("football")
            self.assertEqual(len(games), 1)
            self.assertEqual(games[0]["starts_at"], "2026-09-20T18:00:00.000000Z")
            self.assertEqual(games[0]["home_aliases"], {"home university"})

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
        receipt_payload = json.loads(self.conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0])
        self.assertEqual(receipt_payload["accepted_markets"], 3)
        self.assertEqual(receipt_payload["rejected_records"], 0)
        payload = json.loads(self.conn.execute("SELECT payload_json FROM audit_markets WHERE market='spreads'").fetchone()[0])
        self.assertEqual(payload["event_id"], GAME["id"])

    def test_ingest_does_not_call_unpriced_summaries_rejected(self):
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
        result = ingest(
            self.conn,
            [{"event_id": GAME["id"], "summary": {"pickcenter": []}}],
            receipt,
            [GAME],
            receipt["captured_at"],
        )
        self.assertEqual(result, {"accepted_markets": 0, "rejected_records": 0})
        payload = json.loads(self.conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0])
        self.assertEqual(payload["rejected_records"], 0)

    def test_ingest_marks_all_failed_summary_requests_incomplete(self):
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
        receipt = {
            "captured_at": "2026-11-09T20:00:00Z",
            "sha256": "fixture",
            "eligible_games": 3,
            "summary_fetch_failures": 3,
            "summary_count": 0,
            "summary_with_pickcenter": 0,
            "summary_with_odds": 0,
        }
        result = ingest(self.conn, [], receipt, [GAME], receipt["captured_at"])
        self.assertEqual(result, {"accepted_markets": 0, "rejected_records": 0})
        payload = json.loads(self.conn.execute("SELECT payload_json FROM audit_receipts").fetchone()[0])
        self.assertEqual(payload["eligible_games"], 3)
        self.assertEqual(payload["summary_fetch_failures"], 3)
        self.assertEqual(payload["market_status"], "capture_incomplete")


if __name__ == "__main__":
    unittest.main()
