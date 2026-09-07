import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from ncaa_scraper.basketball_careers import (
    FIELDS,
    ROOT,
    acquire_lock,
    batch_is_current,
    export,
    identifier,
    ingest_season,
    normalize,
    schedule_index,
    summarize,
)

GAME = {
    "game_id": 123,
    "season": 2026,
    "date": "2026-01-01T20:00:00Z",
    "home_id": 10,
    "away_id": 20,
    "home_short_display_name": "Home",
    "away_short_display_name": "Away",
    "home_score": 80,
    "away_score": 70,
    "status_type_completed": True,
    "neutral_site": False,
}
ROW = {
    "game_id": 123,
    "season": 2026,
    "athlete_id": 45,
    "team_id": 10,
    "athlete_display_name": "Player One",
    "did_not_play": False,
    **{k: 0 for k in FIELDS.values()},
    "minutes": 20,
    "points": 10,
    "field_goals_made": 4,
    "field_goals_attempted": 8,
    "three_point_field_goals_made": 2,
    "three_point_field_goals_attempted": 4,
}


class CareerTests(unittest.TestCase):
    def log(self, values=None):
        row = {**ROW, **(values or {})}
        return normalize(row, schedule_index([GAME], 2026), 2026)[0]["log"]

    def test_missing_stat_does_not_become_zero_or_hide_other_metrics(self):
        a = self.log()
        b = self.log({"assists": None, "points": 20})
        result = summarize([a, b])
        self.assertEqual(result["ppg"], 15)
        self.assertIsNone(result["apg"])
        self.assertEqual(result["samples"]["ast"], 1)
        self.assertIsNone(result["totals"]["ast"])
        self.assertEqual(result["efg"], 0.625)
        self.assertEqual(result["ft_rate"], 0)
        self.assertEqual(result["tov_rate"], 0)

    def test_dnp_unknown_minutes_and_unmatched_rows_stay_out_of_rates(self):
        logs = [
            self.log(),
            self.log({"did_not_play": True}),
            self.log({"minutes": None}),
            self.log({"team_id": 99}),
        ]
        result = summarize(logs)
        self.assertEqual(result["source_records"], 4)
        self.assertEqual(result["games"], 1)
        self.assertEqual(result["ppg"], 10)
        self.assertEqual(result["dnp_records"], 1)

    def test_impossible_shooting_is_unavailable(self):
        log = self.log({"field_goals_made": 20})
        self.assertIn("fgm_exceeds_fga", log["issues"])
        self.assertIsNone(summarize([log])["efg"])
        self.assertEqual(summarize([log])["ppg"], 10)

    def test_id_validation_and_source_season(self):
        self.assertEqual(identifier(123.0), "123")
        for value in [None, True, 0, 1.5, "nan", float("inf"), 2**54 * 1.0]:
            self.assertIsNone(identifier(value))
        self.assertEqual(
            normalize({**ROW, "season": 2025}, {}, 2026)[1], "wrong_season"
        )
        self.assertEqual(
            normalize({**ROW, "athlete_id": None}, {}, 2026)[1], "missing_identity"
        )

    def database(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(
            (ROOT / "worker/migrations/0013_basketball_careers.sql").read_text()
        )
        return db

    def test_deduplicate_exact_records_and_reject_conflicts(self):
        db = self.database()
        result = ingest_season(
            db, 2026, [ROW, ROW], [GAME], [{"sha256": "a"}, {"sha256": "b"}]
        )
        self.assertEqual(result["coverage"]["duplicate_rows"], 1)
        self.assertEqual(result["players"][0]["games"], 1)
        with self.assertRaisesRegex(ValueError, "Conflicting player"):
            ingest_season(
                db, 2026, [ROW, {**ROW, "points": 11}], [GAME], [{"sha256": "c"}]
            )

    def test_team_stints_remain_distinct_without_name_joins(self):
        db = self.database()
        game = {**GAME, "game_id": 124}
        rows = [ROW, {**ROW, "game_id": 124, "team_id": 20}, {**ROW, "athlete_id": 46}]
        result = ingest_season(db, 2026, rows, [GAME, game], [{"sha256": "a"}])
        self.assertEqual(len(result["players"]), 3)
        self.assertEqual(result["coverage"]["player_ids"], 2)
        profile = json.loads(
            db.execute(
                "SELECT payload_json FROM bb_career_profiles WHERE athlete_id='45'"
            ).fetchone()[0]
        )
        self.assertEqual(len(profile["teams"]), 2)
        self.assertEqual(profile["overall"]["games"], 2)

    def test_revision_export_preserves_old_rows_and_activates_last(self):
        db = self.database()
        receipt = [{"sha256": "a"}]
        result = ingest_season(db, 2026, [ROW], [GAME], receipt)
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            export(db, directory, {"seasons": [result["coverage"]]})
            sql = "".join(
                p.read_text() for p in sorted(directory.glob("careers-*.sql"))
            )
            self.assertIn("bb_career_seasons", sql.splitlines()[-1])
            replica = self.database()
            replica.executescript(sql)
            replica.executescript(sql)
            self.assertEqual(
                replica.execute("SELECT count(*) FROM bb_career_profiles").fetchone()[
                    0
                ],
                1,
            )
            ingest_season(db, 2026, [{**ROW, "points": 11}], [GAME], [{"sha256": "b"}])
            export(db, directory, {})
            replica.executescript(
                "".join(p.read_text() for p in sorted(directory.glob("careers-*.sql")))
            )
            self.assertEqual(
                replica.execute("SELECT count(*) FROM bb_career_profiles").fetchone()[
                    0
                ],
                2,
            )
            self.assertEqual(
                replica.execute("SELECT count(*) FROM bb_career_seasons").fetchone()[0],
                1,
            )

    def test_active_export_lock_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            with acquire_lock(directory), self.assertRaisesRegex(RuntimeError, "active"):
                acquire_lock(directory)
            with acquire_lock(directory):
                pass

    def test_remote_batches_skip_only_when_all_editions_match(self):
        record = {"seasons": {"2025": "old", "2026": "new"}}
        self.assertTrue(batch_is_current(record, {"2025": "old", "2026": "new"}))
        self.assertFalse(batch_is_current(record, {"2025": "old", "2026": "prior"}))
        self.assertFalse(batch_is_current(record, {}))
        self.assertFalse(batch_is_current({}, {"2025": "old"}))

    def test_schedule_conflict_stops_import(self):
        with self.assertRaisesRegex(ValueError, "Conflicting schedule"):
            schedule_index([GAME, {**GAME, "home_id": 99}], 2026)


if __name__ == "__main__":
    unittest.main()
