import unittest
from datetime import datetime, timezone

from ncaa_scraper.cbbd_recruiting import fetch_json, normalize_endpoint, sql_export


class Response:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit):
        return self.payload


class CbbdRecruitingTests(unittest.TestCase):
    def test_fetch_json_uses_bearer_auth_and_bounds_response(self):
        request = {}

        def opener(req, timeout):
            request["value"] = req
            self.assertEqual(timeout, 30)
            return Response(b'[{"id": 1}]')

        rows, url = fetch_json(
            "/recruiting/portal",
            {"year": 2027},
            "secret",
            opener=opener,
            sleep=lambda _: None,
        )
        self.assertEqual(rows, [{"id": 1}])
        self.assertEqual(url, "https://api.collegebasketballdata.com/recruiting/portal?year=2027")
        self.assertEqual(request["value"].get_header("Authorization"), "Bearer secret")

    def test_normalizes_portal_without_inventing_event_date(self):
        rows = normalize_endpoint(
            "portal",
            2027,
            [
                {
                    "id": 42,
                    "sourceId": "portal-42",
                    "firstName": "Ari",
                    "lastName": "Example",
                    "position": "G",
                    "origin": {"id": 10, "name": "Old U"},
                    "destination": {"id": 20, "name": "New U"},
                    "eligibility": "Immediate",
                    "yearsRemaining": 2,
                    "stars": 4,
                    "rating": 0.98,
                }
            ],
            "https://api.collegebasketballdata.com/recruiting/portal?year=2027",
            "2026-09-09T12:00:00Z",
        )
        row = rows[0]
        self.assertEqual(row["player_name"], "Ari Example")
        self.assertEqual(row["from_program_id"], "10")
        self.assertEqual(row["to_program_id"], "20")
        self.assertIsNone(row["ranking"])
        self.assertNotIn("status_date", row)
        self.assertEqual(len(str(row["source_sha256"])), 64)

    def test_sql_keeps_raw_payload_private_and_is_idempotent(self):
        row = normalize_endpoint(
            "teams",
            2027,
            [{"teamId": 5, "team": "Example U", "ranking": 3, "rating": 92.2}],
            "https://api.collegebasketballdata.com/recruiting/teams?year=2027",
            datetime(2026, 9, 9, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        )[0]
        sql = sql_export([row])
        self.assertIn("CREATE TABLE IF NOT EXISTS bb_cbbd_recruiting", sql)
        self.assertIn("INSERT OR IGNORE INTO bb_cbbd_recruiting", sql)
        self.assertIn('{"ranking":3,"rating":92.2,"team":"Example U","teamId":5}', sql)


if __name__ == "__main__":
    unittest.main()
