import json
import sqlite3
import unittest

from ncaa_scraper.basketball_scouting import (
    METRICS,
    aggregate,
    components,
    describe_game,
    player_workloads,
    rank_metrics,
)


def box(fg=25, fa=60, th=5, ta=20):
    return {
        "field_goals_made": fg,
        "field_goals_attempted": fa,
        "three_point_field_goals_made": th,
        "three_point_field_goals_attempted": ta,
        "free_throws_made": 10,
        "free_throws_attempted": 15,
        "offensive_rebounds": 10,
        "defensive_rebounds": 25,
        "turnovers": 10,
        "assists": 15,
    }


def game(i="1"):
    return {
        "id": i,
        "season": 2026,
        "starts_at": "2026-02-01T12:00:00Z",
        "home_id": "h",
        "away_id": "a",
        "home_name": "Home",
        "away_name": "Away",
        "home_score": 70,
        "away_score": 60,
        "completed": 1,
        "neutral": 0,
        "periods": 2,
    }


class ScoutingTests(unittest.TestCase):
    def test_rates_pool_counts_not_game_percentages(self):
        logs = []
        for i, b in enumerate([box(8, 10, 0, 0), box(36, 90, 0, 0)]):
            b["assists"] = 0
            g = game(str(i))
            logs.append(
                describe_game(g, "h", {(g["id"], "h"): b, (g["id"], "a"): box()}, {})
            )
        summary = aggregate(logs)
        self.assertAlmostEqual(summary["metrics"]["off_efg"]["value"], 0.44)
        self.assertEqual(summary["metrics"]["off_efg"]["games"], 2)

    def test_each_metric_has_its_own_missingness_and_denominator(self):
        b = box()
        b["three_point_field_goals_made"] = None
        c = components(b, box(), 70, None)
        self.assertNotIn("efg", c)
        self.assertNotIn("eff", c)
        self.assertNotIn("tov", c)
        self.assertIn("ftr", c)
        self.assertIn("orb", c)
        b = box(fg=0, fa=0, th=0, ta=0)
        b["assists"] = 0
        c = components(b, box(), 0, 70)
        self.assertNotIn("efg", c)
        self.assertNotIn("three", c)
        self.assertEqual(c["eff"], (0, 70))

    def test_away_view_reverses_sides_and_overtime_normalizes_pace(self):
        g = game()
        g["periods"] = 3
        g["neutral"] = 1
        boxes = {("1", "h"): box(), ("1", "a"): box(20, 60, 10, 30)}
        a = describe_game(g, "a", boxes, {"h": {"rank": 10, "adj_net": 18}})
        h = describe_game(g, "h", boxes, {})
        self.assertEqual(a["location"], "neutral")
        self.assertEqual(a["result"], "L")
        self.assertEqual(a["rates"]["off_efg"], h["rates"]["def_efg"])
        self.assertAlmostEqual(a["pace"], a["possessions"] * 40 / 45)
        self.assertEqual(a["opponent_rank"], 10)
        self.assertEqual(aggregate([a])["scored_games"], 1)

    def test_missing_box_keeps_result_and_other_available_shooting(self):
        g = game()
        r = describe_game(g, "h", {("1", "h"): box()}, {})
        self.assertEqual(r["result"], "W")
        self.assertIsNone(r["possessions"])
        self.assertIn("off_efg", r["rates"])
        self.assertNotIn("def_efg", r["rates"])
        self.assertEqual(aggregate([r])["paired_games"], 0)

    def test_competition_ranks_share_ties_and_require_sample(self):
        profiles = []
        for val, n in [(0.6, 20), (0.6, 20), (0.4, 20), (0.9, 2)]:
            metrics = {k: {"value": val, "games": n} for k in METRICS}
            profiles.append({"splits": {"season": {"metrics": metrics}}})
        rank_metrics(profiles)
        top = profiles[0]["splits"]["season"]["metrics"]
        self.assertEqual(top["off_efg"]["rank"], 1)
        self.assertEqual(top["off_efg"]["percentile"], 75)
        self.assertEqual(
            profiles[2]["splits"]["season"]["metrics"]["off_efg"]["rank"], 3
        )
        self.assertNotIn("rank", profiles[3]["splits"]["season"]["metrics"]["off_efg"])
        self.assertNotIn("rank", top["off_three_rate"])
        self.assertEqual(
            profiles[2]["splits"]["season"]["metrics"]["def_efg"]["rank"], 1
        )

    def test_minutes_prorate_usage_and_dnp_does_not_add_exposure(self):
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        c.execute(
            "CREATE TABLE bb_player_box(team_id,athlete_id,game_id,season,stats_json)"
        )
        g = game()
        b = {
            "minutes": 20,
            "field_goals_attempted": 10,
            "free_throws_attempted": 0,
            "turnovers": 2,
            "assists": 4,
            "three_point_field_goals_attempted": 5,
            "did_not_play": "false",
        }
        c.execute(
            "INSERT INTO bb_player_box VALUES (?,?,?,?,?)",
            ("h", "p", "1", 2026, json.dumps(b)),
        )
        c.execute(
            "INSERT INTO bb_player_box VALUES (?,?,?,?,?)",
            ("h", "dnp", "1", 2026, json.dumps({**b, "did_not_play": "true"})),
        )
        result = player_workloads(c, [g], {("1", "h"): box()}, 2026)
        p = result[("h", "p")]
        self.assertAlmostEqual(p["usage_est"], 12 / (0.5 * (60 + 0.475 * 15 + 10)))
        self.assertEqual(p["minutes_share"], 0.5)
        self.assertEqual(p["usage_games"], 1)
        self.assertEqual(p["assist_turnover_ratio"], 2)
        self.assertNotIn(("h", "dnp"), result)
        c.close()

    def test_empty_split_has_missing_rates_not_zero_strength(self):
        result = aggregate([])
        self.assertEqual(result["games"], 0)
        self.assertIsNone(result["pace"])
        self.assertTrue(
            all(
                m["value"] is None and m["games"] == 0
                for m in result["metrics"].values()
            )
        )


if __name__ == "__main__":
    unittest.main()
