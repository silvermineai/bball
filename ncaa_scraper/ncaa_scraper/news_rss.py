"""Fetch permitted ESPN RSS headlines for the editorial recruiting wire.

The feed is an attribution-friendly headline source. We retain the title,
summary and URL exactly as supplied and never request the linked article page.
"""

from __future__ import annotations

import hashlib
import json
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen

FEEDS = (
    {
        "publisher": "ESPN",
        "sport": "mens-college-basketball",
        "url": "https://www.espn.com/espn/rss/ncb/news",
    },
    {
        "publisher": "NCAA.com",
        "sport": "mens-college-basketball",
        "url": "https://www.ncaa.com/news/basketball-men/d1/rss.xml",
    },
)
FEED_URL = FEEDS[0]["url"]
USER_AGENT = "SilvermineResearch/1.0 (service@silvermineai.com)"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend/public/data/news.json"


def _text(item: ET.Element, name: str) -> str:
    # RSS text is deliberately returned without cleanup so the published copy
    # remains the feed-provided value. ElementTree already resolves CDATA.
    return item.findtext(name) or ""


def _published(value: str) -> str:
    parsed = parsedate_to_datetime(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_rss(
    payload: bytes,
    *,
    feed_url: str = FEED_URL,
    publisher: str = "ESPN",
    sport: str = "mens-college-basketball",
) -> list[dict]:
    """Parse one RSS feed without changing supplied content fields."""
    root = ET.fromstring(payload)
    articles: list[dict] = []
    for item in root.findall("./channel/item"):
        title = _text(item, "title")
        description = _text(item, "description")
        link = _text(item, "link")
        guid = _text(item, "guid") or link
        published_raw = _text(item, "pubDate")
        if not title or not link or not published_raw:
            continue
        try:
            published = _published(published_raw)
        except (TypeError, ValueError, OverflowError):
            continue
        article_id = hashlib.sha256(f"{feed_url}\x00{guid}".encode()).hexdigest()[:20]
        categories = [value for value in (_text(item, "category"),) if value]
        creator = item.findtext("{http://purl.org/dc/elements/1.1/}creator") or ""
        articles.append(
            {
                "id": article_id,
                "headline": title,
                "description": description,
                "published": published,
                "link": link,
                "categories": categories,
                "publisher": publisher,
                "sport": sport,
                "author": creator,
            }
        )
    return articles


def fetch_feed(feed_url: str = FEED_URL, *, timeout: int = 30) -> bytes:
    request = Request(feed_url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml"})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def build_release(*, feeds: tuple[dict, ...] = FEEDS, limit: int = 40) -> dict:
    started = time.time()
    articles: list[dict] = []
    for index, feed in enumerate(feeds):
        if index:
            time.sleep(1.0)
        articles.extend(
            parse_rss(
                fetch_feed(str(feed["url"])),
                feed_url=str(feed["url"]),
                publisher=str(feed["publisher"]),
                sport=str(feed["sport"]),
            )
        )
    articles.sort(key=lambda article: article["published"], reverse=True)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": 2,
        "generated_at": now,
        "feeds": list(feeds),
        "articles": articles[:limit],
        "attribution": {
            "publisher": "ESPN",
            "method": "Published RSS feed; headline, summary and URL are retained as supplied. Linked article pages are not fetched.",
            "terms": "https://www.espn.com/espn/news/story?page=rssinfo",
            "elapsed_seconds": round(time.time() - started, 3),
        },
    }


def write_release(output: Path = DEFAULT_OUTPUT, *, feeds: tuple[dict, ...] = FEEDS, limit: int = 40) -> dict:
    release = build_release(feeds=feeds, limit=limit)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(release, ensure_ascii=False, separators=(",", ":")) + "\n")
    return release


if __name__ == "__main__":
    release = write_release()
    print(json.dumps({"articles": len(release["articles"]), "generated_at": release["generated_at"]}))
