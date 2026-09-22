import importlib.util
from pathlib import Path
import unittest

_module_spec = importlib.util.spec_from_file_location(
    "scrape_womens_recruiting_history",
    Path(__file__).parents[2] / "scripts/scrape-womens-recruiting-history.py",
)
assert _module_spec and _module_spec.loader
_module = importlib.util.module_from_spec(_module_spec)
_module_spec.loader.exec_module(_module)
build_history = _module.build_history
parse_seasons = _module.parse_seasons


def release(season: int, prospects: int = 2) -> dict:
    rows = [{"athlete_id": str(season * 10 + index), "name": f"Prospect {index}"} for index in range(prospects)]
    return {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "season": season,
        "edition": f"{season:064x}"[-64:],
        "captured_at": f"2026-09-{season - 2020:02d}T00:00:00Z",
        "coverage": {"prospects": prospects, "graded": prospects - 1, "ranked": 0, "committed": 0},
        "records": rows,
    }


class WomensRecruitingHistoryTests(unittest.TestCase):
    def test_parse_seasons_deduplicates_and_sorts(self):
        self.assertEqual(parse_seasons("2027, 2025,2027,2026"), (2025, 2026, 2027))
        with self.assertRaisesRegex(ValueError, "between 2025"):
            parse_seasons("2024")
        with self.assertRaisesRegex(ValueError, "eight classes"):
            parse_seasons(",".join(str(year) for year in range(2025, 2034)))

    def test_history_preserves_class_boundaries_and_reconciles_coverage(self):
        calls = []

        def fake_capture(season, workers):
            calls.append((season, workers))
            return release(season, prospects=season - 2023)

        history = build_history((2027, 2025, 2027), capture_fn=fake_capture)
        self.assertEqual(calls, [(2025, 8), (2027, 8)])
        self.assertEqual(history["classes"], [2025, 2027])
        self.assertEqual(history["coverage"], {"seasons": 2, "prospects": 6, "graded": 4, "ranked": 0, "committed": 0})
        self.assertEqual([item["season"] for item in history["releases"]], [2025, 2027])

    def test_history_rejects_mismatched_or_empty_release(self):
        def mismatched(season, workers):
            return release(season + 1)

        with self.assertRaisesRegex(ValueError, "mismatched"):
            build_history((2027,), capture_fn=mismatched)

        def empty(season, workers):
            value = release(season)
            value["records"] = []
            return value

        with self.assertRaisesRegex(ValueError, "empty"):
            build_history((2027,), capture_fn=empty)


if __name__ == "__main__":
    unittest.main()
