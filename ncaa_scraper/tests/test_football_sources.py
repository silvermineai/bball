import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from ncaa_scraper.football_sources import ReleaseClient, SourceUnavailable


class ReleaseClientTests(unittest.TestCase):
    def test_mismatched_cache_is_refetched_without_conditional_header(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "recruits_2026.csv"
            path.write_bytes(b"id,name\n1,Corrupted\n")
            receipt = root / "recruits_2026.csv.receipt.json"
            receipt.write_text(json.dumps({
                "dataset": "recruits",
                "season": 2026,
                "etag": "stale-etag",
                "sha256": hashlib.sha256(b"id,name\n1,Returning Player\n").hexdigest(),
            }))
            response = Mock(
                status_code=200,
                headers={"ETag": "fresh-etag"},
                content=b"id,name\n1,Returning Player\n",
            )
            client = ReleaseClient(root, {"recruits": ("test", "recruits_{year}.csv")})
            client.session.get = Mock(return_value=response)
            with patch("ncaa_scraper.football_sources.time.sleep"):
                rows, returned = client.load("recruits", 2026)
            self.assertEqual(rows, [{"id": "1", "name": "Returning Player"}])
            self.assertEqual(returned["sha256"], hashlib.sha256(response.content).hexdigest())
            self.assertEqual(client.session.get.call_args.kwargs["headers"], {})

    def test_transient_source_failure_uses_hash_verified_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "recruits_2026.csv"
            payload = b"id,name\n1,Returning Player\n"
            path.write_bytes(payload)
            receipt = root / "recruits_2026.csv.receipt.json"
            original = {
                "dataset": "recruits",
                "season": 2026,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "fetched_at": "2026-09-17T10:00:00Z",
            }
            receipt.write_text(json.dumps(original))
            response = Mock(status_code=503, headers={})
            client = ReleaseClient(root, {"recruits": ("test", "recruits_{year}.csv")})
            client.session.get = Mock(return_value=response)
            with patch("ncaa_scraper.football_sources.time.sleep"):
                rows, returned = client.load("recruits", 2026, refresh=True)
            self.assertEqual(rows, [{"id": "1", "name": "Returning Player"}])
            self.assertEqual(returned, original)
            self.assertEqual(json.loads(receipt.read_text()), original)
            self.assertEqual(client.session.get.call_count, 5)

    def test_transient_failure_without_verified_cache_still_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            response = Mock(status_code=503, headers={})
            client = ReleaseClient(root, {"recruits": ("test", "recruits_{year}.csv")})
            client.session.get = Mock(return_value=response)
            with patch("ncaa_scraper.football_sources.time.sleep"):
                with self.assertRaises(SourceUnavailable):
                    client.load("recruits", 2026, refresh=True)


if __name__ == "__main__":
    unittest.main()
