import copy
import json
import unittest

import numpy as np
from ncaa_scraper.football_evaluation import calibrate_rows
from ncaa_scraper.football_features import (
    OUT,
    SPEC,
    calibrated,
    corrected,
    enrich,
    feature_state,
    fit_correction,
    paired_inputs,
)


class FeatureTests(unittest.TestCase):
    def test_strict_cutoff_and_missing_pair(self):
        pairs = [
            {
                "game_id": "1",
                "season": 2024,
                "kickoff": "2024-09-01T00:00:00Z",
                "home_id": "a",
                "away_id": "b",
                "home": {"epa": 10, "yards": 200, "plays": 40},
                "away": {"epa": -4, "yards": 100, "plays": 50},
            }
        ]
        state = feature_state(pairs, 2025, "2025-09-01T00:00:00Z")
        self.assertEqual(state["teams"]["a"]["off_plays"], 20)
        prior = 6 / 90
        self.assertAlmostEqual(state["prior"]["epa"], prior)
        self.assertAlmostEqual(
            state["teams"]["a"]["rates"]["off_epa"], (5 + 300 * prior) / (20 + 300)
        )
        future = copy.deepcopy(pairs[0])
        future.update(game_id="2", season=2025, kickoff="2025-09-01T00:00:00Z")
        future["home"]["epa"] = 1e6
        self.assertEqual(
            feature_state(pairs + [future], 2025, "2025-09-01T00:00:00Z"), state
        )
        self.assertNotEqual(
            feature_state(pairs + [future], 2025, "2025-09-02T00:00:00Z")["id"],
            state["id"],
        )
        game = {
            "id": "1",
            "season": 2024,
            "kickoff": pairs[0]["kickoff"],
            "home_id": "a",
            "away_id": "b",
        }
        raw = {
            "game_id": "1",
            "season": "2024",
            "pos_team_id": "a",
            "EPA_overall_off": "10",
            "off_yards": "200",
            "scrimmage_plays": "40",
        }
        self.assertEqual(paired_inputs([game], [raw]), [])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            paired_inputs([game], [raw, raw])

    def test_future_efficiency_cannot_change_training_or_calibration(self):
        pairs = json.loads((OUT / "advanced-inputs.json").read_text())["games"]
        train = json.loads((OUT / "training.json").read_text())["rows"]
        cal = json.loads((OUT / "calibration.json").read_text())["rows"]
        changed = copy.deepcopy(pairs)
        for g in changed:
            if g["season"] == 2025:
                g["home"]["epa"] += 1000
                g["away"]["yards"] += 5000
        a, sa = enrich(train + cal, pairs)
        b, sb = enrich(train + cal, changed)
        self.assertEqual(a, b)
        self.assertEqual(sa, sb)
        model = fit_correction(a[: len(train)], list(range(5)))
        self.assertEqual(model, fit_correction(b[: len(train)], list(range(5))))
        ca = calibrate_rows(
            [{**r, "raw_margin": corrected(r, model)[0]} for r in a[len(train) :]]
        )
        cb = calibrate_rows(
            [{**r, "raw_margin": corrected(r, model)[0]} for r in b[len(train) :]]
        )
        self.assertEqual(ca, cb)
        states = json.loads((OUT / "feature-states.json").read_text())["states"]
        last = states[-1]
        self.assertNotEqual(
            feature_state(changed, last["season"], last["training_before"])["id"],
            last["id"],
        )

    def test_ridge_normal_equations_and_training_only_standardization(self):
        rows = json.loads((OUT / "training.json").read_text())["rows"]
        model = fit_correction(rows, list(range(5)))
        x = np.array([r["features"] for r in rows])
        mean = x.mean(axis=0)
        scale = x.std(axis=0)
        self.assertTrue(np.allclose(mean, model["mean"]))
        self.assertTrue(np.allclose(scale, model["scale"]))
        z = np.column_stack((np.ones(len(x)), (x - mean) / scale))
        y = np.array(
            [
                r["game"]["home_score"] - r["game"]["away_score"] - r["raw_margin"]
                for r in rows
            ]
        )
        coef = np.array(model["coefficients"])
        reg = coef * SPEC["ridge_penalty"]
        reg[0] = 0
        self.assertLess(abs(z.T @ (z @ coef - y) + reg).max(), 1e-8)
        future = copy.deepcopy(rows)
        future[0]["game"]["season"] = 2025
        with self.assertRaisesRegex(ValueError, "2023"):
            fit_correction(future, [0])

    def test_candidate_contributions_and_probability_mapping_reproduce_every_game(self):
        s = json.loads((OUT / "summary.json").read_text())
        games = json.loads((OUT / "games.json").read_text())["games"]
        for g in games:
            row = {"raw_margin": g["weekly"]["home_margin"], "features": g["features"]}
            for method in ("control", "efficiency"):
                margin, parts = corrected(row, s["models"][method])
                self.assertAlmostEqual(margin, g[method]["home_margin"], places=10)
                self.assertAlmostEqual(
                    parts["intercept"] + sum(parts["features"]),
                    parts["correction"],
                    places=10,
                )
                self.assertEqual(
                    calibrated(margin, g["weekly"]["total"], s["calibration"][method]),
                    g[method],
                )


if __name__ == "__main__":
    unittest.main()
