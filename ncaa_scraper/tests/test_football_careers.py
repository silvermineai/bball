import unittest

from ncaa_scraper.football_careers import build


class FootballCareerTests(unittest.TestCase):
    def test_groups_only_exact_source_id_and_keeps_categories_separate(self):
        rows = [
            {
                "id": "10",
                "name": "A Player",
                "season": 2024,
                "team_id": "1",
                "team": "Alpha",
                "conference": "A",
                "division": "fbs",
                "box_games": 8,
                "production": {
                    "passing": {"plays": 100, "yards": 900, "epa": 10, "touchdowns": 8, "rank": 5},
                    "rushing": {"plays": 20, "yards": 80, "epa": 2, "touchdowns": 1, "rank": 20},
                },
            },
            {
                "id": "10",
                "name": "A Player Jr.",
                "season": 2025,
                "team_id": "2",
                "team": "Beta",
                "conference": "B",
                "division": "fbs",
                "box_games": 10,
                "production": {"passing": {"plays": 200, "yards": 1800, "epa": 30, "touchdowns": 15, "rank": 2}},
            },
            {"id": "-10", "name": "Team", "season": 2025, "team_id": "2", "box_games": 10, "production": {"passing": {"plays": 999}}},
            {"id": "11", "name": "Other", "season": 2025, "team_id": "3", "team": "Gamma", "box_games": 1, "production": {}},
        ]
        result = build(rows, [2024, 2025], generated_at="2026-01-01T00:00:00Z")
        self.assertEqual(result["coverage"]["player_count"], 2)
        player = next(p for p in result["players"] if p["id"] == "10")
        self.assertEqual(player["name"], "A Player Jr.")
        self.assertEqual(player["seasons"], [2024, 2025])
        self.assertEqual(player["box_games"], 18)
        self.assertEqual([t["team"] for t in player["teams"]], ["Alpha", "Beta"])
        self.assertEqual(player["production"]["passing"]["plays"], 300)
        self.assertEqual(player["production"]["passing"]["epa"], 40)
        self.assertAlmostEqual(player["production"]["passing"]["epa_per_play"], 40 / 300)
        self.assertEqual(player["production"]["passing"]["best_rank"], 2)
        self.assertEqual(player["production"]["rushing"]["plays"], 20)

    def test_invalid_or_nonfinite_production_does_not_leak_nan(self):
        result = build(
            [{
                "id": "1",
                "name": "Player",
                "season": 2025,
                "team_id": "1",
                "team": "Alpha",
                "box_games": 1,
                "production": {"passing": {"plays": "bad", "yards": float("nan"), "epa": 1}},
            }],
            [2025],
            generated_at="2026-01-01T00:00:00Z",
        )
        self.assertEqual(result["players"][0]["production"]["passing"]["epa"], 1)
        self.assertIsNone(result["players"][0]["production"]["passing"]["epa_per_play"])
