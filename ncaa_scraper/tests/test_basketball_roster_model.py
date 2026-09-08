import unittest

from ncaa_scraper.basketball_roster_model import FEATURES, fit, metrics, predict


def row(i: int, target: float | None = None) -> dict:
    prior = 2.0 + i * 0.1
    return {
        "team_id": str(i),
        "prior_net": prior,
        "returning_minutes_share": 0.2 + (i % 7) / 20,
        "represented_minutes_share": 0.4 + (i % 9) / 20,
        "incoming_minutes_share": 0.1 + (i % 5) / 30,
        "listed_players": 8 + i % 5,
        "target_net": target if target is not None else prior + 1.5,
    }


class RosterModelTests(unittest.TestCase):
    def test_fit_uses_declared_features_and_predicts(self):
        model = fit([row(i) for i in range(25)])
        self.assertEqual(model["features"], list(FEATURES))
        self.assertEqual(model["rows"], 25)
        prediction = predict(model, row(2))
        self.assertIsNotNone(prediction)
        self.assertGreater(prediction, 3.0)
        self.assertLess(prediction, 5.0)

    def test_metrics_compares_challenger_with_prior_net(self):
        model = fit([row(i) for i in range(25)])
        result = metrics(model, [row(i, target=2.0 + i * 0.1 + 2.0) for i in range(25)])
        self.assertEqual(result["teams"], 25)
        self.assertIsNotNone(result["mae"])
        self.assertIsNotNone(result["baseline_mae"])

    def test_missing_source_feature_is_not_imputed(self):
        model = fit([row(i) for i in range(25)])
        incomplete = row(1)
        incomplete["returning_minutes_share"] = None
        self.assertIsNone(predict(model, incomplete))


if __name__ == "__main__":
    unittest.main()
