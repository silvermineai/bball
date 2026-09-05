import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from ncaa_scraper.basketball_shooting import (
    BOX_KEYS,
    counts,
    location,
    matches,
    normalize,
)
from ncaa_scraper.bulk_parquet import parquet_file
from ncaa_scraper.football_sources import ReleaseClient, SourceUnavailable


def event(**updates):
    return {
        "id": 401804830116281260,
        "shooting_play": True,
        "type_text": "JumpShot",
        "points_attempted": 3,
        "score_value": 3,
        "scoring_play": False,
        "team_id": 150,
        "athlete_id_1": 123,
        "coordinate_x_raw": 48,
        "coordinate_y_raw": 1,
        "text": "Player misses 23-foot three point jumper",
        **updates,
    }


class ShotTests(unittest.TestCase):
    def setUp(self):
        self.game = {"home_id": "150", "away_id": "248"}

    def test_misses_keep_attempt_value_and_exact_event_identity(self):
        s, reason = normalize(event(), self.game)
        self.assertIsNone(reason)
        self.assertEqual(s["id"], "401804830116281260")
        self.assertFalse(s["made"])
        self.assertEqual(s["points"], 3)
        self.assertEqual(counts([s]), [1, 0, 1, 0])

    def test_explicit_value_fallback_and_ambiguous_outcomes(self):
        s, _ = normalize(event(points_attempted=0), self.game)
        self.assertTrue(s["inferred_value"])
        self.assertEqual(s["points"], 3)
        for changes in [
            {"score_value": 2},
            {"scoring_play": None},
            {"team_id": 99},
            {"id": None},
        ]:
            self.assertIsNone(normalize(event(**changes), self.game)[0])
        self.assertIsNone(
            normalize(event(type_text="MadeFreeThrow", points_attempted=1), self.game)[
                0
            ]
        )

    def test_missing_shooter_does_not_invent_an_identity(self):
        s, _ = normalize(event(athlete_id_1=None), self.game)
        self.assertIsNone(s["player"])
        self.assertEqual(s["team"], "150")

    def test_location_guards_preserve_shot_outcome(self):
        for x, y, reason in [
            (None, 3, "missing"),
            (51, 2, "out_of_bounds"),
            (25, 0, "placeholder"),
            (25, 2, "inconsistent"),
        ]:
            s, _ = normalize(event(coordinate_x_raw=x, coordinate_y_raw=y), self.game)
            self.assertIsNone(s["x"])
            self.assertEqual(s["location_status"], reason)
            self.assertFalse(s["made"])
        self.assertEqual(
            location(25, 60, 3, "three", "misses 60-foot jumper"), (25, 60, "located")
        )
        self.assertEqual(location(25, 83, 2, "layup", "makes layup")[2], "inconsistent")

    def test_reconciliation_requires_all_four_counts(self):
        miss, _ = normalize(event(), self.game)
        made, _ = normalize(event(scoring_play=True), self.game)
        box = dict(zip(BOX_KEYS, [2, 1, 2, 1]))
        self.assertTrue(matches([miss, made], box))
        for key in BOX_KEYS:
            self.assertFalse(matches([miss, made], {**box, key: None}))
            self.assertFalse(matches([miss, made], {**box, key: box[key] + 1}))


class CacheTests(unittest.TestCase):
    def test_cached_large_release_requires_matching_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "test_2026.parquet"
            pq.write_table(pa.table({"game": [1]}), path)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            receipt = root / "test_2026.parquet.receipt.json"
            receipt.write_text(json.dumps({"sha256": digest}))
            c = ReleaseClient(root, {"pbp": ("test", "test_{year}.parquet")})
            self.assertEqual(parquet_file(c, "pbp", 2026)[0], path)
            receipt.write_text(json.dumps({"sha256": "changed"}))
            with self.assertRaises(SourceUnavailable):
                parquet_file(c, "pbp", 2026)


if __name__ == "__main__":
    unittest.main()
