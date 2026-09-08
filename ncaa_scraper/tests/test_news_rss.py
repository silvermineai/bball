import unittest

from ncaa_scraper.news_rss import parse_rss


class NewsRssTests(unittest.TestCase):
    def test_parser_keeps_feed_copy_and_normalizes_timestamp(self):
        payload = b'''<?xml version="1.0"?><rss><channel><item>
          <title><![CDATA[Portal &amp; prep update]]></title>
          <description>Summary exactly as supplied.</description>
          <link>https://www.espn.com/story/1</link>
          <pubDate>Tue, 8 Sep 2026 16:01:09 EST</pubDate>
          <guid>US-EN-1</guid><category>Recruiting</category>
        </item></channel></rss>'''
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
