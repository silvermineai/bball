import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "refresh_recruiting_evidence", ROOT / "scripts/refresh_recruiting_evidence.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class RefreshRecruitingEvidenceTests(unittest.TestCase):
    def test_extract_title_decodes_html_and_strips_brand_suffix(self):
        payload = b"<html><head><title>Huskies Sign Four Newcomers For 2026-27 &amp; More</title></head></html>"
        self.assertEqual(
            MODULE.extract_title(payload),
            "Huskies Sign Four Newcomers For 2026-27 & More",
        )
        self.assertTrue(
            MODULE.title_matches(
                "Huskies Sign Four Newcomers For 2026-27",
                MODULE.extract_title(payload),
            )
        )

    def test_revalidation_updates_only_matching_https_pages(self):
        document = {
            "sources": [
                {"id": "match", "url": "https://example.test/news/match", "title": "A New Transfer"},
                {"id": "mismatch", "url": "https://example.test/news/mismatch", "title": "A New Transfer"},
            ]
        }
        original = MODULE.robots_allowed
        try:
            MODULE.robots_allowed = lambda url, cache: True
            refreshed, report = MODULE.revalidate_document(
                document,
                fetcher=lambda url: "A New Transfer — Example Athletics" if url.endswith("/match") else "Unrelated Story",
                sleep_seconds=0,
            )
        finally:
            MODULE.robots_allowed = original
        self.assertEqual(report["checked"], 2)
        self.assertEqual(report["updated"], 1)
        self.assertEqual(report["skipped"], 1)
        self.assertIn("checked_at", refreshed["sources"][0])
        self.assertNotIn("checked_at", refreshed["sources"][1])


if __name__ == "__main__":
    unittest.main()
