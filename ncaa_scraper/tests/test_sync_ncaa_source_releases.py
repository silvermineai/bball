"""Tests for the NCAA source archive publisher."""

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "sync-ncaa-source-releases.py"
SPEC = importlib.util.spec_from_file_location("sync_ncaa_source_releases", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SyncNCAASourceReleasesTest(unittest.TestCase):
    def test_archive_requires_exact_id_box_supplement(self):
        source = ROOT / "frontend/public/data/basketball/ncaa-individual.json"
        payload = json.loads(source.read_text())
        payload.pop("supplements", None)

        with self.assertRaisesRegex(ValueError, "run ncaa_individual_enrichment"):
            MODULE.validate_national_individual_release(payload)

    def test_national_individual_archive_is_content_addressed_and_receipted(self):
        source = ROOT / "frontend/public/data/basketball/ncaa-individual.json"
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        uploads: list[tuple[Path, str, str]] = []
        original_put = MODULE.put
        MODULE.put = lambda path, key, content_type: uploads.append((path, key, content_type))
        try:
            receipt = MODULE.archive_national_individual()
        finally:
            MODULE.put = original_put

        self.assertEqual(receipt["dataset"], "ncaa_individual")
        self.assertEqual(receipt["season"], 2026)
        self.assertEqual(receipt["sha256"], digest)
        self.assertEqual(receipt["kind"], "normalized_public_derivative")
        self.assertEqual(len(uploads), 2)
        self.assertEqual(uploads[0][1], f"bball-research/basketball/ncaa-individual/2026/{digest}.json")
        self.assertEqual(uploads[1][1], f"bball-research/basketball/ncaa-individual/2026/{digest}.receipt.json")
        self.assertTrue(uploads[0][0].samefile(source))
        self.assertEqual(uploads[0][2], "application/json")
        self.assertEqual(uploads[1][2], "application/json")


if __name__ == "__main__":
    unittest.main()
