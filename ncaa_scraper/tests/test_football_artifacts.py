import json
import sqlite3
import unittest

from ncaa_scraper.football_artifacts import manifest_statements, quote


class ManifestTests(unittest.TestCase):
    def test_large_unicode_and_quote_payload_is_staged_before_activation(self):
        conn = sqlite3.connect(":memory:")
        conn.execute(
            "CREATE TABLE football_artifacts(name TEXT PRIMARY KEY,generated_at TEXT,payload_json TEXT)"
        )
        conn.execute("INSERT INTO football_artifacts VALUES ('test','old-clock','old')")
        payload = json.dumps(
            {"files": {f"{i}-'🏀": str(i) * 100 for i in range(2000)}},
            ensure_ascii=False,
        )
        stage, statements, activate, cleanup = manifest_statements(
            "test", "new-clock", payload
        )
        self.assertGreater(len(statements), 1)
        for sql in statements:
            self.assertLess(len(sql.encode()), 100000)
            conn.execute(sql)
            self.assertEqual(
                conn.execute(
                    "SELECT payload_json FROM football_artifacts WHERE name='test'"
                ).fetchone()[0],
                "old",
            )
        self.assertEqual(
            conn.execute(
                "SELECT payload_json FROM football_artifacts WHERE name=" + quote(stage)
            ).fetchone()[0],
            payload,
        )
        conn.execute(activate)
        self.assertEqual(
            conn.execute(
                "SELECT generated_at,payload_json FROM football_artifacts WHERE name='test'"
            ).fetchone(),
            ("new-clock", payload),
        )
        conn.execute(cleanup)
        self.assertEqual(
            conn.execute("SELECT count(*) FROM football_artifacts").fetchone()[0], 1
        )
        conn.close()

    def test_concurrent_attempts_have_distinct_staging_rows(self):
        a = manifest_statements("name", "clock", "payload")[0]
        b = manifest_statements("name", "clock", "payload")[0]
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
