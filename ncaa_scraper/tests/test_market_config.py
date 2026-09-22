import json
import unittest

from ncaa_scraper.market_config import market_configuration


class MarketConfigurationTests(unittest.TestCase):
    def test_reports_redacted_status_for_credentialed_paths(self):
        result = market_configuration(
            {"THE_ODDS_API_KEY": "odds-secret", "CBBD_API_KEY": "cbbd-secret"},
            {},
        )
        connectors = {row["id"]: row for row in result["connectors"]}
        self.assertEqual(connectors["odds_api"]["credential_status"], "configured")
        self.assertEqual(connectors["cbbd_lines"]["credential_status"], "configured")
        self.assertEqual(connectors["espn_summary"]["credential_status"], "not_required")
        self.assertIn("--sport basketball", connectors["odds_api"]["commands"]["basketball"])
        self.assertIn("--season 2027", connectors["cbbd_lines"]["commands"]["basketball"])
        self.assertNotIn("odds-secret", json.dumps(result))
        self.assertNotIn("cbbd-secret", json.dumps(result))

    def test_accepts_documented_file_aliases_and_reports_missing_keys(self):
        result = market_configuration(
            {"THE_ODDS_API_KEY": "   "},
            {"ODDS_API_KEY": "file-odds", "COLLEGE_BASKETBALL_DATA_API_KEY": "file-cbbd"},
        )
        connectors = {row["id"]: row for row in result["connectors"]}
        self.assertEqual(connectors["odds_api"]["credential_status"], "configured")
        self.assertEqual(connectors["cbbd_lines"]["credential_status"], "configured")
        self.assertIn("--sport football", connectors["licensed_csv"]["commands"]["football"])
        self.assertIn("exact-game", connectors["licensed_csv"]["next_step"])

    def test_reports_missing_credentials_without_attempting_a_provider_call(self):
        result = market_configuration({"THE_ODDS_API_KEY": " "}, {"CBBD_API_KEY": ""})
        connectors = {row["id"]: row for row in result["connectors"]}
        self.assertEqual(connectors["odds_api"]["credential_status"], "missing")
        self.assertEqual(connectors["cbbd_lines"]["credential_status"], "missing")
        self.assertIn("No line is inferred", result["policy"])


if __name__ == "__main__":
    unittest.main()
