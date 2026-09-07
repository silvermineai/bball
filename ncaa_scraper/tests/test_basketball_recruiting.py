import copy
import json
import sqlite3
import unittest
from pathlib import Path

from ncaa_scraper.basketball_recruiting import build, sql_export

ROOT = Path(__file__).resolve().parents[2]


class RecruitingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads((ROOT / "data/recruiting/announcements.json").read_text())
        cls.box = json.loads(
            (ROOT / "frontend/public/data/basketball/players.json").read_text()
        )
        overview = json.loads(
            (ROOT / "frontend/public/data/basketball/overview.json").read_text()
        )
        cls.programs = {p["id"]: p["name"] for p in overview["ratings"]}

    def test_reviewed_links_and_missing_stats(self):
        release = build(self.doc, self.box, self.programs)
        self.assertEqual(release["coverage"]["historical_links"], 33)
        self.assertFalse(release["coverage"]["complete_national_coverage"])
        self.assertTrue(
            all(
                p["stats"] is None
                for p in release["people"]
                if p["category"] != "transfer"
            )
        )

    def test_redshirt_and_same_name_prep_do_not_inherit_college_production(self):
        release = build(self.doc, self.box, self.programs)
        people = {p["key"]: p for p in release["people"]}
        self.assertIsNone(people["2509-caden-pierce"]["stats"])
        self.assertIsNone(people["2305-trent-perry"]["stats"])
        self.assertEqual(people["2305-trent-perry"]["category"], "freshman")
        self.assertIsNone(people["62-jaden-matingou"]["stats"])
        self.assertIsNone(people["153-cade-bennerman"]["stats"])
        self.assertIsNone(people["153-neo-avdalas"]["stats"])
        hampton = people["62-kellen-hampton"]["stats"]
        self.assertEqual((hampton["games"], hampton["mpg"]), (1, 1.0))
        self.assertEqual(hampton["team_id"], "279")
        self.assertIn("ts", hampton)
        self.assertIn("three_pct", hampton)

    def test_nickname_does_not_bypass_reviewed_full_name_rule(self):
        doc = copy.deepcopy(self.doc)
        person = next(p for p in doc["people"] if p["key"] == "153-neo-avdalas")
        person["stats_ref"] = {
            "player_id": "5311829",
            "team_id": "259",
            "season": 2026,
            "basis": "Same prior program but a different first name.",
        }
        with self.assertRaisesRegex(ValueError, "identity"):
            build(doc, self.box, self.programs)

    def test_reviewed_school_spellings_still_require_exact_player_and_team_ids(self):
        for key in ["62-marcus-adams-jr", "62-houran-dan", "2305-christian-reeves"]:
            with self.subTest(key=key):
                doc = copy.deepcopy(self.doc)
                person = next(p for p in doc["people"] if p["key"] == key)
                person["stats_ref"]["team_id"] = "999"
                with self.assertRaisesRegex(ValueError, "identity"):
                    build(doc, self.box, self.programs)

    def test_name_alone_cannot_join_and_duplicate_identity_fails(self):
        box = copy.deepcopy(self.box)
        player = next(p for p in box["players"] if p["name"] == "Najai Hines")
        player["team"] = "Wrong Program"
        with self.assertRaisesRegex(ValueError, "identity"):
            build(self.doc, box, self.programs)
        box = copy.deepcopy(self.box)
        box["players"].append(
            next(p for p in box["players"] if p["name"] == "Najai Hines").copy()
        )
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            build(self.doc, box, self.programs)

    def test_explicit_provider_name_alias_keeps_reviewed_identity_link(self):
        box = copy.deepcopy(self.box)
        player = next(p for p in box["players"] if p["id"] == "5142326")
        player["name"] = "Marcus Adams"
        release = build(self.doc, box, self.programs)
        linked = next(p for p in release["people"] if p["key"] == "62-marcus-adams-jr")
        self.assertEqual(linked["stats"]["id"], "5142326")

    def test_reviewed_id_must_match(self):
        doc = copy.deepcopy(self.doc)
        doc["people"][0]["stats_ref"]["player_id"] = "999"
        with self.assertRaisesRegex(ValueError, "identity"):
            build(doc, self.box, self.programs)

    def test_publication_date_not_guessed_from_url(self):
        release = build(self.doc, self.box, self.programs)
        source = next(s for s in release["sources"] if s["id"] == "michigan-estrella")
        self.assertIn("/4/26/", source["url"])
        self.assertEqual(source["published_on"], "2026-04-28")
        self.assertGreater(source["checked_at"][:10], source["published_on"])

    def test_source_host_and_chronology(self):
        for field, value in [
            ("url", "https://uconnhuskies.com.evil.example/news/1"),
            ("published_on", "2035-01-01"),
            ("checked_at", "2024-01-01T00:00:00"),
        ]:
            doc = copy.deepcopy(self.doc)
            doc["sources"][0][field] = value
            with self.assertRaises(ValueError):
                build(doc, self.box, self.programs)

    def test_database_keeps_revisions_and_original_observation_time(self):
        release = build(self.doc, self.box, self.programs)
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(
            (ROOT / "worker/migrations/0012_basketball_recruiting.sql").read_text()
        )
        sql = sql_export(release)
        db.executescript(sql)
        before = db.execute(
            "SELECT revision,first_recorded_at FROM bb_recruiting_evidence ORDER BY revision"
        ).fetchall()
        db.executescript(sql)
        self.assertEqual(
            before,
            db.execute(
                "SELECT revision,first_recorded_at FROM bb_recruiting_evidence ORDER BY revision"
            ).fetchall(),
        )
        self.assertTrue(all(row[1][:10] > "2026-09-01" for row in before))
        changed = copy.deepcopy(self.doc)
        changed["events"][0]["summary"] += " Editorial clarification."
        new_release = build(changed, self.box, self.programs)
        db.executescript(sql_export(new_release))
        self.assertEqual(
            db.execute("SELECT count(*) FROM bb_recruiting_evidence").fetchone()[0],
            len(before) + 1,
        )
        self.assertEqual(
            db.execute("SELECT count(*) FROM bb_recruiting_releases").fetchone()[0], 2
        )
        self.assertEqual(
            db.execute("SELECT edition FROM bb_recruiting_current").fetchone()[0],
            new_release["edition"],
        )

    def test_availability_is_additional_evidence(self):
        release = build(self.doc, self.box, self.programs)
        mccoy = next(p for p in release["people"] if p["name"] == "Brandon McCoy Jr.")
        events = [e for e in release["events"] if e["person_key"] == mccoy["key"]]
        self.assertEqual(
            {e["kind"] for e in events}, {"addition", "season_unavailable"}
        )


if __name__ == "__main__":
    unittest.main()
