import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from ncaa_scraper.news_rss import build_release, parse_rss, write_release


class NewsRssTests(unittest.TestCase):
    def test_parser_keeps_feed_copy_and_normalizes_timestamp(self):
        payload = b'''<?xml version="1.0"?><rss><channel><item>
          <title><![CDATA[Portal &amp; prep update]]></title>
          <description>Summary exactly as supplied.</description>
          <link>https://www.espn.com/story/1</link>
          <pubDate>Tue, 8 Sep 2026 16:01:09 EST</pubDate>
          <guid>US-EN-1</guid><category>Recruiting</category>
        </item></channel></rss>'''
        payload = payload.replace(b"https://www.espn.com/story/1", b"https://www.ncaa.com/news/1")
        rows = parse_rss(payload, feed_url="https://example.test/feed", publisher="NCAA.com")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["headline"], "Portal &amp; prep update")
        self.assertEqual(rows[0]["description"], "Summary exactly as supplied.")
        self.assertEqual(rows[0]["published"], "2026-09-08T21:01:09Z")
        self.assertEqual(rows[0]["publisher"], "NCAA.com")
        self.assertEqual(rows[0]["sport"], "mens-college-basketball")

    def test_parser_skips_incomplete_items(self):
        payload = b"<rss><channel><item><title>Missing URL</title></item></channel></rss>"
        self.assertEqual(parse_rss(payload), [])

    def test_espn_basketball_feed_excludes_non_basketball_urls(self):
        payload = b'''<?xml version="1.0"?><rss><channel>
          <item><title>Basketball portal</title><description>Hoops.</description>
            <link>https://www.espn.com/mens-college-basketball/story/_/id/1/portal</link>
            <pubDate>Tue, 8 Sep 2026 16:01:09 EST</pubDate><guid>basketball</guid></item>
          <item><title>Football portal</title><description>Football.</description>
            <link>https://www.espn.com/college-football/story/_/id/2/portal</link>
            <pubDate>Tue, 8 Sep 2026 16:02:09 EST</pubDate><guid>football</guid></item>
        </channel></rss>'''
        rows = parse_rss(payload, publisher="ESPN", sport="mens-college-basketball")
        self.assertEqual([row["headline"] for row in rows], ["Basketball portal"])

    def test_parser_retains_explicit_ncaa_division_scope(self):
        payload = b'''<?xml version="1.0"?><rss><channel><item>
          <title>Division II update</title><description>Hoops.</description>
          <link>https://www.ncaa.com/news/basketball-men/d2/2026/09/08/update</link>
          <pubDate>Tue, 8 Sep 2026 16:01:09 EST</pubDate><guid>d2-1</guid>
        </item></channel></rss>'''
        rows = parse_rss(payload, publisher="NCAA.com", division="D-II")
        self.assertEqual(rows[0]["division"], "D-II")

    def test_parser_rejects_cross_site_and_non_https_source_links(self):
        payload = b'''<?xml version="1.0"?><rss><channel>
          <item><title>Tracker</title><link>https://example.test/story</link>
            <pubDate>Tue, 8 Sep 2026 16:01:09 EST</pubDate><guid>tracker</guid></item>
          <item><title>Insecure</title><link>http://www.espn.com/mens-college-basketball/story/1</link>
            <pubDate>Tue, 8 Sep 2026 16:02:09 EST</pubDate><guid>insecure</guid></item>
        </channel></rss>'''
        self.assertEqual(parse_rss(payload, publisher="ESPN", sport="mens-college-basketball"), [])

    def test_failed_feed_keeps_source_specific_prior_rows(self):
        prior = [{
            "id": "old-ncaa",
            "publisher": "NCAA.com",
            "sport": "mens-college-basketball",
            "headline": "Prior NCAA headline",
            "description": "Prior summary",
            "published": "2026-09-01T00:00:00Z",
            "link": "https://www.ncaa.com/news/old",
            "categories": [],
            "author": "",
        }]

        def empty_feed(_: str) -> bytes:
            return b""

        release = build_release(
            feeds=(
                {
                    "publisher": "NCAA.com",
                    "sport": "mens-college-basketball",
                    "url": "https://example.test/ncaa.xml",
                },
            ),
            previous_articles=prior,
            fetcher=empty_feed,
        )
        self.assertEqual([row["id"] for row in release["articles"]], ["old-ncaa"])
        self.assertEqual(release["attribution"]["feed_errors"][0]["fallback_articles"], 1)

    def test_write_release_uses_prior_file_when_feed_is_empty(self):
        prior = {
            "schema_version": 2,
            "generated_at": "2026-09-01T00:00:00Z",
            "feeds": [],
            "articles": [{
                "id": "old",
                "publisher": "ESPN",
                "sport": "mens-college-basketball",
                "headline": "Prior headline",
                "description": "Prior summary",
                "published": "2026-09-01T00:00:00Z",
                "link": "https://www.espn.com/mens-college-basketball/story/old",
                "categories": [],
                "author": "",
            }],
        }
        with TemporaryDirectory() as directory:
            output = Path(directory) / "news.json"
            output.write_text(json.dumps(prior))
            # write_release uses the production fetcher, so patch it at the
            # module boundary and restore it immediately after the assertion.
            import ncaa_scraper.news_rss as module
            original = module.fetch_feed
            module.fetch_feed = lambda _: b""
            try:
                release = write_release(output=output, feeds=(
                    {
                        "publisher": "ESPN",
                        "sport": "mens-college-basketball",
                        "url": "https://example.test/espn.xml",
                    },
                ))
            finally:
                module.fetch_feed = original
        self.assertEqual(release["articles"][0]["id"], "old")
