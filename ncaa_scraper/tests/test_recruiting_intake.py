import csv
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from ncaa_scraper.recruiting_intake import read_csv, sql_export


class RecruitingIntakeTests(unittest.TestCase):
    def write(self, rows, fields=None):
        path = Path(tempfile.mkstemp(suffix=".csv")[1])
        fields = fields or list(rows[0])
        with path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        self.addCleanup(path.unlink)
        return path

    def base(self, **changes):
        value = {
            "record_id": "provider-1",
            "season": "2027",
            "player_name": "Example Player",
            "player_source_id": "p-1",
            "from_program": "Example State",
            "from_program_id": "from-1",
            "to_program": "Example U",
            "to_program_id": "to-1",
            "status": "reported_transfer",
            "status_date": "2026-04-01",
            "source_published_on": "2026-04-01",
            "source_url": "https://provider.example/records/1",
            "source_publisher": "Authorized Provider",
            "captured_at": "2026-04-02T12:00:00Z",
        }
        value.update(changes)
        return value

    def test_accepts_source_clocks_and_writes_audited_sql(self):
        rows, digest = read_csv(
            self.write([self.base()]),
            provider="Authorized Provider",
            license_url="https://provider.example/terms",
            now=datetime(2026, 4, 3, tzinfo=timezone.utc),
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(digest), 64)
        sql = sql_export(rows)
        self.assertIn("bb_recruiting_intake", sql)
        self.assertIn("provider-1", sql)
        self.assertIn("https://provider.example/terms", sql)

    def test_rejects_future_or_unlicensed_source(self):
        with self.assertRaises(ValueError):
            read_csv(
                self.write([self.base(captured_at="2026-04-04T12:00:00Z")]),
                provider="Authorized Provider",
                license_url="https://provider.example/terms",
                now=datetime(2026, 4, 3, tzinfo=timezone.utc),
            )
        with self.assertRaises(ValueError):
            read_csv(
                self.write([self.base()]),
                provider="Authorized Provider",
                license_url="http://provider.example/terms",
            )

    def test_requires_origin_program_for_transfer(self):
        with self.assertRaises(ValueError):
            read_csv(
                self.write([self.base(from_program="")]),
                provider="Authorized Provider",
                license_url="https://provider.example/terms",
            )
