"""Prospective evaluation invariants with explicit clocks and known outcomes."""

import copy
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from ncaa_scraper.odds_feed import fetch, ingest, match_event, normalize_market
from ncaa_scraper.research_ledger import (
    ROOT,
    build_report,
    export_sql,
    observe_state,
    register,
    source_connection,
    timestamp,
)

T0 = "2026-09-04T12:00:00Z"
T1 = "2026-09-04T13:00:00Z"
START = "2026-09-05T12:00:00Z"
END = "2026-09-05T16:00:00Z"


def game():
    return {
        "id": "123",
        "season": 2026,
        "home_id": "1",
        "away_id": "2",
        "home_name": "Home",
        "away_name": "Away",
        "starts_at": START,
        "time_tbd": 0,
        "neutral": 0,
        "prediction": {
            "home_margin": 7.0,
            "total": 50.0,
            "home_win_probability": 0.75,
            "margin_low": -3.0,
            "margin_high": 17.0,
        },
    }


def model(name="v1"):
    return {"id": name, "cutoff": T0}


def state(final=False, home=30, away=20):
    return {
        "home_id": "1",
        "away_id": "2",
        "starts_at": START,
        "time_tbd": 0,
        "completed": int(final),
        "home_score": home if final else None,
        "away_score": away if final else None,
    }


def event():
    return {
        "id": "provider-1",
        "sport_key": "americanfootball_ncaaf",
        "commence_time": START,
        "home_team": "Home",
        "away_team": "Away",
        "bookmakers": [
            {
                "key": "test-book",
                "last_update": T1,
                "markets": [
                    {
                        "key": "spreads",
                        "outcomes": [
                            {"name": "Home", "point": -3.0, "price": 1.91},
                            {"name": "Away", "point": 3.0, "price": 1.91},
                        ],
                    },
                    {
                        "key": "totals",
                        "outcomes": [
                            {"name": "Over", "point": 50.0, "price": 1.91},
                            {"name": "Under", "point": 50.0, "price": 1.91},
                        ],
                    },
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": "Home", "price": 1.5},
                            {"name": "Away", "price": 3.0},
                        ],
                    },
                ],
            }
        ],
    }


def schedule():
    return {
        **game(),
        "completed": 0,
        "starts_at": timestamp(START),
        "home_aliases": {"home"},
        "away_aliases": {"away"},
    }


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.executescript(
            (ROOT / "worker/migrations/0010_research_ledger.sql").read_text()
        )
        register(self.c, "football", game(), model(), T0, T0)
        observe_state(self.c, "football", "123", state(), T0)

    def tearDown(self):
        self.c.close()

    def report(self, now="2026-09-05T19:00:00Z"):
        return build_report(self.c, now)

    def test_registration_is_immutable_and_timezone_canonical(self):
        register(self.c, "football", game(), model(), T0, T1)
        row = self.c.execute("select * from audit_predictions").fetchone()
        self.assertEqual(row["registered_at"], timestamp(T0))
        g = game()
        g["prediction"]["home_margin"] = 99
        with self.assertRaises(ValueError):
            register(self.c, "football", g, model(), T0, T1)
        self.assertEqual(timestamp("2026-09-04T05:00:00-07:00"), timestamp(T0))
        with self.assertRaises(ValueError):
            timestamp("2026-09-04T12:00:00")
        with self.assertRaises(ValueError):
            register(self.c, "football", game(), model("later"), T1, T0)

    def test_first_eligible_registration_not_best_hindsight_model(self):
        g = game()
        g["prediction"]["home_margin"] = 10
        register(self.c, "football", g, model("v2"), T1, T1)
        observe_state(self.c, "football", "123", state(True), END)
        r = self.report()
        metrics = r["sports"]["football"]["metrics"]
        self.assertEqual(r["games"][0]["model_id"], "v1")
        self.assertEqual({v["model_id"] for v in r["versions"]}, {"v1", "v2"})
        self.assertEqual(metrics["games"], 1)
        self.assertEqual(metrics["margin_mae"], 3)
        self.assertEqual(metrics["brier"], 0.0625)
        self.assertEqual(metrics["interval_coverage"], 1)

    def test_uncertain_changed_or_late_games_are_excluded(self):
        for i, (changes, reason) in enumerate(
            [
                ({"time_tbd": 1}, "unconfirmed_start"),
                ({"starts_at": "2026-09-06T12:00:00Z"}, "schedule_changed"),
                ({"away_id": "8"}, "participants_changed"),
            ]
        ):
            with self.subTest(reason=reason):
                observe_state(
                    self.c,
                    "football",
                    "123",
                    {**state(), **changes},
                    f"2026-09-04T{13 + i}:00:00Z",
                )
                r = self.report()
                self.assertEqual(r["games"][0]["exclusion"], reason)
                observe_state(
                    self.c, "football", "123", state(), f"2026-09-04T{13 + i}:01:00Z"
                )
        observe_state(self.c, "football", "123", None, END)
        self.assertEqual(self.report()["games"][0]["exclusion"], "missing_schedule")
        g = game()
        g["id"] = "late"
        register(self.c, "football", g, model(), T0, END)
        observe_state(self.c, "football", "late", state(True), END)
        self.assertEqual(
            next(r for r in self.report()["games"] if r["game_id"] == "late")[
                "exclusion"
            ],
            "registered_after_start",
        )

    def test_missing_final_and_corrections_keep_history(self):
        observe_state(self.c, "football", "123", state(True, home=None), END)
        self.assertEqual(self.report()["games"][0]["status"], "final_missing_scores")
        observe_state(self.c, "football", "123", state(True), "2026-09-05T17:00:00Z")
        self.assertEqual(
            self.report()["sports"]["football"]["metrics"]["margin_mae"], 3
        )
        observe_state(
            self.c, "football", "123", state(True, home=32), "2026-09-05T18:00:00Z"
        )
        self.assertEqual(
            self.report()["sports"]["football"]["metrics"]["margin_mae"], 5
        )
        self.assertEqual(
            self.c.execute("select count(*) from audit_game_states").fetchone()[0], 4
        )

    def test_market_math_and_comparison_requires_observed_pregame(self):
        receipt = {"captured_at": T1}
        ingest(self.c, "football", [event()], receipt, [schedule()])
        observe_state(self.c, "football", "123", state(True), END)
        comparisons = {r["market"]: r for r in self.report()["games"][0]["comparisons"]}
        version_comparisons = {
            r["market"]
            for r in next(v for v in self.report()["versions"] if v["model_id"] == "v1")["comparisons"]
        }
        self.assertEqual(version_comparisons, {"spreads", "totals", "h2h"})
        self.assertEqual(comparisons["spreads"]["model_difference"], 4)
        self.assertEqual(comparisons["spreads"]["market_absolute_error"], 7)
        self.assertEqual(comparisons["spreads"]["direction_result"], "win")
        self.assertEqual(comparisons["totals"]["direction_result"], "pass")
        self.assertAlmostEqual(comparisons["h2h"]["market_home_probability"], 2 / 3)
        # Future timestamps cannot masquerade as a pregame capture.
        self.c.execute("UPDATE audit_markets SET captured_at=?", (timestamp(END),))
        self.assertEqual(self.report()["games"][0]["comparisons"], [])

    def test_push_and_away_cover_signs(self):
        ingest(self.c, "football", [event()], {"captured_at": T1}, [schedule()])
        observe_state(self.c, "football", "123", state(True, 23, 20), END)
        self.assertEqual(
            next(
                r
                for r in self.report()["games"][0]["comparisons"]
                if r["market"] == "spreads"
            )["direction_result"],
            "push",
        )
        observe_state(
            self.c, "football", "123", state(True, 20, 23), "2026-09-05T17:00:00Z"
        )
        spread = next(
            r
            for r in self.report()["games"][0]["comparisons"]
            if r["market"] == "spreads"
        )
        self.assertEqual(spread["direction_result"], "loss")

    def test_unmatched_ambiguous_or_reversed_events_never_join(self):
        e = event()
        with self.assertRaises(ValueError):
            match_event(e, [schedule(), schedule()])
        e["home_team"], e["away_team"] = e["away_team"], e["home_team"]
        result = ingest(self.c, "football", [e], {"captured_at": T1}, [schedule()])
        self.assertEqual(result["accepted_markets"], 0)
        self.assertEqual(
            self.c.execute("select count(*) from audit_unmatched").fetchone()[0], 1
        )

    def test_market_rejects_bad_lines_prices_and_clocks(self):
        e = event()
        book = e["bookmakers"][0]
        for change in ("price", "line", "clock", "draw"):
            market = copy.deepcopy(book["markets"][0])
            if change == "price":
                market["outcomes"][0]["price"] = 0
            if change == "line":
                market["outcomes"][1]["point"] = 2
            if change == "clock":
                market["last_update"] = END
            if change == "draw":
                market["outcomes"].append({"name": "Draw", "price": 5})
            with self.subTest(change=change), self.assertRaises(ValueError):
                normalize_market(e, book, market, schedule(), T1, "receipt")

    def test_export_cannot_overwrite_existing_registration(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "dump.sql"
            export_sql(self.c, path)
            sql = path.read_text()
            self.assertNotIn("REPLACE", sql)
            self.c.executescript(sql)
            self.assertEqual(
                self.c.execute("select count(*) from audit_predictions").fetchone()[0],
                1,
            )

    def test_as_of_report_cannot_see_later_result_observations(self):
        observe_state(self.c, "football", "123", state(True), END)
        before = self.report("2026-09-05T14:00:00Z")
        self.assertEqual(before["games"][0]["status"], "awaiting_result")
        self.assertEqual(before["sports"]["football"]["metrics"]["games"], 0)
        self.assertEqual(self.report()["sports"]["football"]["metrics"]["games"], 1)

    def test_stale_and_pre_registration_quotes_do_not_qualify(self):
        ingest(self.c, "football", [event()], {"captured_at": T1}, [schedule()])
        self.c.execute(
            "UPDATE audit_markets SET updated_at=?",
            (timestamp("2026-09-02T12:00:00Z"),),
        )
        self.assertEqual(self.report()["games"][0]["comparisons"], [])
        self.c.execute(
            "UPDATE audit_markets SET updated_at=?,captured_at=?",
            (timestamp("2026-09-04T10:00:00Z"), timestamp("2026-09-04T11:00:00Z")),
        )
        self.assertEqual(self.report()["games"][0]["comparisons"], [])

    def test_http_failure_does_not_expose_key_or_retry(self):
        response = Mock(status_code=401)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with patch("ncaa_scraper.odds_feed.requests.get", return_value=response) as get:
            with self.assertRaises(RuntimeError) as failure:
                fetch("football", "SECRET_TEST_KEY")
            self.assertNotIn("SECRET_TEST_KEY", str(failure.exception))
            self.assertEqual(get.call_count, 1)

    def test_source_sql_export_is_a_safe_ci_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".local").mkdir()
            (root / "worker/migrations").mkdir(parents=True)
            (root / "worker/migrations/0008_football.sql").write_text(
                (ROOT / "worker/migrations/0008_football.sql").read_text()
            )
            (root / ".local/football.sql").write_text(
                "INSERT INTO football_sources VALUES ('schedule',2026,'{}');"
            )
            with patch("ncaa_scraper.research_ledger.ROOT", root):
                with source_connection("football") as source:
                    self.assertEqual(
                        source.execute("SELECT count(*) FROM football_sources").fetchone()[0],
                        1,
                    )
            self.assertFalse((root / ".local/football.sqlite3").exists())


if __name__ == "__main__":
    unittest.main()
