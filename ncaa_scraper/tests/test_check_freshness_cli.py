import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class CheckFreshnessCliTest(unittest.TestCase):
    def test_failure_report_is_retained_when_gate_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "freshness.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts/check-freshness.py"),
                    "--sport",
                    "football",
                    "--max-age-hours",
                    "0",
                    "--report-file",
                    str(report_path),
                ],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 1)
            self.assertTrue(report_path.exists())
            report = json.loads(report_path.read_text())
            self.assertFalse(report["ok"])
            self.assertEqual(report["sport"], "football")
            self.assertIn("max_age_hours must be positive", report["errors"])
            self.assertIn("max_age_hours must be positive", result.stdout)


if __name__ == "__main__":
    unittest.main()
