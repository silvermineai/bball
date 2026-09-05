import copy
import unittest
from datetime import datetime, timezone

from ncaa_scraper.basketball_evaluation import (
    metrics,
    paired_difference,
    rolling_predictions,
    training_before,
    week_start,
)
from ncaa_scraper.basketball_model import fit, raw_predict


def game(identity, date, season, home="1", away="2", home_score=75):
    return {
        "id": str(identity),
        "starts_at": date,
        "season": season,
        "completed": 1,
        "home_id": home,
        "away_id": away,
        "home_name": home,
        "away_name": away,
        "neutral": 0,
        "home_score": home_score,
        "away_score": 70,
        "home_eff": home_score / 0.7,
        "away_eff": 100.0,
        "pace": 70.0,
        "periods": 2,
    }


def fixture():
    prior = [
        game(
            i,
            "2024-03-01T20:00:00Z",
            2024,
            str(i % 3 + 1),
            str((i + 1) % 3 + 1),
            70 + i % 13,
        )
        for i in range(120)
    ]
    target = [
        game(200, "2024-11-04T20:00:00Z", 2025),
        game(201, "2024-11-10T20:00:00Z", 2025),
        game(202, "2024-11-11T20:00:00Z", 2025),
        game(203, "2024-11-18T20:00:00Z", 2025),
    ]
    return prior + target


class EvaluationTest(unittest.TestCase):
    def test_utc_week_and_strict_buffer(self):
        self.assertEqual(
            week_start("2024-11-03T18:00:00-08:00"),
            datetime(2024, 11, 4, tzinfo=timezone.utc),
        )
        with self.assertRaises(ValueError):
            week_start("2024-11-04T00:00:00")
        cutoff = datetime(2024, 11, 10, 20, tzinfo=timezone.utc)
        self.assertNotIn(
            "201", {g["id"] for g in training_before(fixture(), 2025, cutoff)}
        )

    def test_frozen_field_and_every_fit_cutoff(self):
        games = fixture() + [
            game(500 + i, "2024-11-11T21:00:00Z", 2025, "4", "1") for i in range(12)
        ]
        base, predictions, fits = rolling_predictions(games, 2025)
        self.assertEqual(base["teams"], ["1", "2", "3"])
        self.assertEqual(len(predictions), 4)
        lookup = {g["id"]: g for g in games}
        for record in fits:
            self.assertEqual(record["model"]["teams"], base["teams"])
            for identity in record["training_ids"]:
                self.assertLess(
                    lookup[identity]["starts_at"], record["training_before"]
                )
        monday_fit = next(f for f in fits if f["week_start"].startswith("2024-11-11"))
        self.assertIn("200", monday_fit["training_ids"])
        self.assertNotIn("201", monday_fit["training_ids"])
        self.assertNotIn("202", monday_fit["training_ids"])

    def test_future_result_cannot_change_earlier_predictions(self):
        games = fixture()
        _, original, _ = rolling_predictions(games, 2025)
        changed = copy.deepcopy(games)
        changed[-2]["home_score"] = 180
        changed[-2]["home_eff"] = 180 / 0.7
        _, altered, _ = rolling_predictions(changed, 2025)
        for before, after in zip(original[:3], altered[:3]):
            self.assertEqual(before[1], after[1])
            self.assertEqual(before[2], after[2])
        self.assertNotEqual(original[-1][1], altered[-1][1])

    def test_explicit_field_retains_default_fit(self):
        prior = fixture()[:120]
        model = fit(prior)
        explicit = fit(prior, teams=model["teams"])
        self.assertEqual(model, explicit)
        self.assertEqual(
            raw_predict(model, fixture()[-1]), raw_predict(explicit, fixture()[-1])
        )

    def test_metrics_and_signed_paired_difference(self):
        rows = []
        for i, actual in enumerate((5, -5)):
            p = {
                "home_margin": 0,
                "total": 140,
                "home_win_probability": 0.5,
                "margin_low": -5,
                "margin_high": 5,
            }
            w = {
                **p,
                "home_margin": actual,
                "home_win_probability": 0.8 if actual > 0 else 0.2,
            }
            rows.append(
                {
                    "home_score": 70 + actual,
                    "away_score": 70,
                    "starts_at": f"2025-01-{6 + i * 7:02d}T20:00:00Z",
                    "preseason": p,
                    "weekly": w,
                }
            )
        result = metrics(rows, "preseason")
        self.assertEqual(result["margin_mae"], 5)
        self.assertEqual(result["margin_bias"], 0)
        self.assertEqual(result["brier"], 0.25)
        self.assertEqual(result["winner_accuracy"], 0.5)
        self.assertEqual(result["interval_coverage"], 1)
        delta = paired_difference(rows, replicates=100)
        self.assertEqual(
            (delta["difference"], delta["low"], delta["high"]), (-5.0, -5.0, -5.0)
        )
        self.assertIsNone(metrics([], "weekly")["margin_mae"])
        self.assertIsNone(paired_difference(rows[:1])["low"])


if __name__ == "__main__":
    unittest.main()
