import contextlib
import copy
import io
import json
import unittest
from datetime import timedelta
from pathlib import Path

from ncaa_scraper.football_evaluation import (
    calibrate_rows,
    iso,
    rolling,
    timestamp,
    training_before,
    week_start,
)


class FootballEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.games = json.loads(
            (
                Path(__file__).resolve().parents[2]
                / "frontend/public/data/football/evaluation/training-games.json"
            ).read_text()
        )["games"]

    def test_calendar_cutoff_is_timezone_aware_and_strict(self):
        self.assertEqual(
            iso(week_start("2025-09-07T23:30:00-07:00")), "2025-09-08T00:00:00Z"
        )
        with self.assertRaises(ValueError):
            timestamp("2025-09-08T00:00:00")
        g = copy.deepcopy(self.games[0])
        cutoff = timestamp(g["kickoff"])
        self.assertEqual(training_before([g], 2025, cutoff), [])
        self.assertEqual(training_before([g], 2025, cutoff + timedelta(seconds=1)), [g])

    def test_future_results_cannot_change_earlier_fits(self):
        with contextlib.redirect_stdout(io.StringIO()):
            _, _, original = rolling(self.games, 2025)
            cutoff = timestamp(original[8]["training_before"])
            changed = copy.deepcopy(self.games)
            for g in changed:
                if g["season"] == 2025 and timestamp(g["kickoff"]) >= cutoff:
                    g["home_score"] += 100
            _, _, modified = rolling(changed, 2025)
        self.assertEqual(original[:9], modified[:9])
        self.assertNotEqual(original[-1]["model"], modified[-1]["model"])
        by_id = {g["id"]: g for g in self.games}
        for f in original:
            self.assertTrue(
                all(
                    timestamp(by_id[i]["kickoff"]) < timestamp(f["training_before"])
                    for i in f["training_ids"]
                )
            )

    def test_evaluation_outcomes_do_not_change_calibration(self):
        changed = copy.deepcopy(self.games)
        for g in changed:
            if g["season"] == 2025:
                g["home_score"], g["away_score"] = g["away_score"] + 50, g["home_score"]
        with contextlib.redirect_stdout(io.StringIO()):
            _, a, fa = rolling(self.games, 2024)
            _, b, fb = rolling(changed, 2024)
        self.assertEqual(fa, fb)
        self.assertEqual(calibrate_rows(a), calibrate_rows(b))
        self.assertEqual({r["game"]["season"] for r in a}, {2024})

    def test_calibration_needs_a_separate_nontrivial_binary_sample(self):
        with self.assertRaises(ValueError):
            calibrate_rows([])
        row = {"raw_margin": 1, "game": {"home_score": 10, "away_score": 0}}
        with self.assertRaises(ValueError):
            calibrate_rows([row] * 100)


if __name__ == "__main__":
    unittest.main()
