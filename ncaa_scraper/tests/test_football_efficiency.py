import copy
import json
import unittest

from ncaa_scraper.football_efficiency import aggregate, season_release


def game(gid, opponent="b", division="fbs"):
    return {
        "id": gid,
        "season": 2025,
        "home_id": "a",
        "away_id": opponent,
        "home_name": "Alpha",
        "away_name": opponent,
        "home_division": "fbs",
        "away_division": division,
        "home_score": 21,
        "away_score": 7,
        "completed": 1,
        "neutral": 0,
        "kickoff": "2025-09-01T12:00:00Z",
        "time_tbd": 0,
        "source_json": json.dumps({"season_type": "regular"}),
    }


def row(gid, team, epa, plays):
    return {
        "game_id": gid,
        "pos_team_id": team,
        "pos_team": team,
        "season": "2025",
        "EPA_overall_off": str(epa),
        "scrimmage_plays": str(plays),
    }


class EfficiencyTests(unittest.TestCase):
    def test_rates_weight_totals_and_keep_missing_zero_negative_distinct(self):
        rows = [row("1", "a", 10, 10), row("2", "a", -10, 90), row("3", "a", "NaN", 40)]
        rates = aggregate(rows)
        self.assertEqual(
            rates["epa"], {"value": 0, "numerator": 0, "denominator": 100, "games": 2}
        )
        self.assertIsNone(rates["power"]["value"])
        rows[0].update(rushing_power_success="0", rushing_power="2")
        rows[1].update(rushing_power_success="0", rushing_power="0")
        self.assertEqual(
            aggregate(rows)["power"],
            {"value": 0, "numerator": 0, "denominator": 2, "games": 1},
        )

    def test_opponent_rows_are_joined_by_game_and_team_and_scope_is_consistent(self):
        games = {"1": game("1"), "2": game("2", "c", "fcs"), "3": game("3")}
        rows = [
            row("1", "a", 10, 50),
            row("1", "b", -5, 40),
            row("2", "a", 30, 50),
            row("2", "c", 4, 20),
        ]
        profile = next(
            p for p in season_release(rows, games, {}, 2025) if p["id"] == "a"
        )
        self.assertAlmostEqual(
            profile["samples"]["all"]["offense"]["epa"]["value"], 0.4
        )
        self.assertAlmostEqual(
            profile["samples"]["all"]["defense"]["epa"]["value"], -1 / 60
        )
        sample = profile["samples"]["fbs"]
        self.assertEqual(
            (sample["games"], sample["paired_games"], sample["scheduled_finals"]),
            (1, 1, 2),
        )
        self.assertEqual(sample["offense"]["epa"]["value"], 0.2)
        self.assertEqual(sample["defense"]["epa"]["value"], -0.125)
        self.assertEqual([g["id"] for g in sample["missing_games"]], ["3"])

    def test_missing_opponent_and_nonfinal_do_not_become_zero_defense(self):
        games = {"1": game("1"), "2": game("2")}
        games["2"]["completed"] = 0
        profile = season_release(
            [row("1", "a", 0, 30), row("2", "a", 100, 10)], games, {}, 2025
        )[0]
        self.assertEqual(profile["samples"]["all"]["offense"]["epa"]["value"], 0)
        self.assertIsNone(profile["samples"]["all"]["defense"]["epa"]["value"])
        self.assertEqual(profile["samples"]["all"]["paired_games"], 0)
        self.assertEqual(len(profile["games"]), 2)

    def test_duplicate_and_mismatched_identity_stop_aggregation(self):
        r = row("1", "a", 1, 1)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            season_release([r, r], {"1": game("1")}, {}, 2025)
        for field, value in [
            ("game_id", "missing"),
            ("pos_team_id", "stranger"),
            ("season", "2026"),
        ]:
            wrong = copy.deepcopy(r)
            wrong[field] = value
            with (
                self.subTest(field=field),
                self.assertRaisesRegex(ValueError, "identity"),
            ):
                season_release([wrong], {"1": game("1")}, {}, 2025)


if __name__ == "__main__":
    unittest.main()
