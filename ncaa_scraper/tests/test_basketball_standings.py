import unittest
from unittest.mock import patch

from ncaa_scraper import basketball_standings


class BasketballStandingsTests(unittest.TestCase):
    def test_compacts_stat_rows_by_team_and_keeps_labels(self):
        class FakeClient:
            def load(self, dataset, year, refresh=False):
                self.seen = (dataset, year, refresh)
                return [
                    {"group_id": "1", "group_name": "League", "group_short_name": "L", "team_id": "7", "team_display_name": "Seven", "stat_name": "wins", "stat_display_name": "Wins", "display_value": "20", "value": "20"},
                    {"group_id": "1", "group_name": "League", "group_short_name": "L", "team_id": "7", "team_display_name": "Seven", "stat_name": "winPercent", "stat_display_name": "Win percentage", "display_value": "0.8", "value": "0.8"},
                    {"group_id": "1", "group_name": "League", "group_short_name": "L", "team_id": "8", "team_display_name": "Eight", "stat_name": "wins", "display_value": "10", "value": "10"},
                ], {"sha256": "abc", "url": "https://example.test/standings", "fetched_at": "2026-01-01T00:00:00Z"}

        with patch.object(basketball_standings, "client", return_value=FakeClient()):
            release = basketball_standings.build(years=[2026])
        self.assertEqual(len(release["teams"]), 2)
        seven = next(row for row in release["teams"] if row["team_id"] == "7")
        self.assertEqual(seven["stats"]["wins"]["value"], 20)
        self.assertEqual(seven["stats"]["winPercent"]["display"], "0.8")
        self.assertEqual(release["seasons"][0]["rows"], 3)
