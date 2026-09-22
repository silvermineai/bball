import hashlib
import importlib.util
import unittest
from pathlib import Path

_module_spec = importlib.util.spec_from_file_location("scrape_womens_recruiting", Path(__file__).parents[2] / "scripts/scrape-womens-recruiting.py")
assert _module_spec and _module_spec.loader
_module = importlib.util.module_from_spec(_module_spec)
_module_spec.loader.exec_module(_module)
listed_ids = _module.listed_ids
normalize = _module.normalize


class WomensRecruitingCaptureTests(unittest.TestCase):
    def test_list_requires_one_complete_page_and_unique_ids(self):
        payload = {"count": 2, "pageIndex": 1, "pageSize": 200, "pageCount": 1, "items": [{"$ref": "https://example.test/recruits/10"}, {"$ref": "https://example.test/recruits/11"}]}
        self.assertEqual(listed_ids(payload), ["10", "11"])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            listed_ids({**payload, "items": [{"$ref": "https://example.test/recruits/10"}] * 2})

    def test_normalize_keeps_unpublished_rank_and_commitment_unavailable(self):
        detail = {
            "athlete": {
                "id": "10", "displayName": "Ava Example", "height": 72, "weight": 150,
                "position": {"abbreviation": "SG"}, "highSchool": {"name": "Example High"},
                "hometown": {"city": "Albany", "stateAbbreviation": "GA"},
            },
            "grade": 93, "attributes": [], "status": {"id": 0, "description": "Undecided"},
        }
        row = normalize(detail, "10", b"detail", 2027, "2026-09-22T00:00:00Z")
        self.assertEqual(row["grade"], 93)
        self.assertIsNone(row["rank"])
        self.assertIsNone(row["committed_team_id"])
        self.assertEqual(row["source_sha256"], hashlib.sha256(b"detail").hexdigest())


if __name__ == "__main__":
    unittest.main()
