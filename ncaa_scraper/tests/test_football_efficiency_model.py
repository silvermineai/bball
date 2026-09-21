import math
import unittest

from ncaa_scraper.football_efficiency_model import (
    _correct,
    _correction_detail,
    _fit,
    _metrics,
    _transition_evaluations,
)


class FootballEfficiencyModelTests(unittest.TestCase):
    def rows(self, count=120):
        return [
            {
                "features": [float(i % 17), 0.1 * (i % 9), -0.08 * (i % 7), 0.2 * (i % 5), -0.15 * (i % 6)],
                "base_margin": float(i % 17),
                "actual_margin": float(i % 17) + (1.5 if i % 2 else -1.5),
            }
            for i in range(count)
        ]

    def test_fit_and_correct_use_declared_feature_vector(self):
        model = _fit(self.rows())
        self.assertIsNotNone(model)
        self.assertEqual(len(model["features"]), 5)
        self.assertTrue(math.isfinite(_correct(self.rows()[0], model)))

    def test_correction_detail_reconciles_to_margin_and_declares_features(self):
        model = _fit(self.rows())
        row = self.rows()[3]
        detail = _correction_detail(row, model)
        self.assertEqual(
            [feature["key"] for feature in detail["features"]],
            [
                "base_margin",
                "home_off_epa_minus_away_off_epa",
                "home_def_epa_minus_away_def_epa",
                "home_off_ypp_minus_away_off_ypp",
                "home_def_ypp_minus_away_def_ypp",
            ],
        )
        self.assertAlmostEqual(detail["margin"], _correct(row, model))
        self.assertAlmostEqual(
            detail["correction"],
            model["coefficients"][0]
            + sum(feature["contribution"] for feature in detail["features"]),
        )

    def test_metrics_reports_baseline_and_challenger(self):
        rows = self.rows()
        model = _fit(rows)
        metrics = _metrics(rows, model)
        self.assertEqual(metrics["rows"], 120)
        self.assertTrue(metrics["challenger_mae"] >= 0)
        self.assertTrue(metrics["baseline_mae"] >= 0)

    def test_transition_evaluations_only_use_prior_seasons(self):
        transitions = {2022: self.rows(), 2023: self.rows(), 2024: self.rows(), 2025: self.rows()}
        evaluations = _transition_evaluations(transitions, 2026)
        self.assertEqual([e["test_season"] for e in evaluations], [2023, 2024, 2025])
        self.assertEqual(evaluations[0]["training_seasons"], [2022])
        self.assertEqual(evaluations[1]["training_seasons"], [2022, 2023])
        self.assertEqual(evaluations[2]["training_seasons"], [2022, 2023, 2024])
        self.assertEqual(evaluations[0]["training_rows"], 120)
        self.assertEqual(evaluations[1]["training_rows"], 240)
        self.assertEqual(evaluations[2]["training_rows"], 360)


if __name__ == "__main__":
    unittest.main()
