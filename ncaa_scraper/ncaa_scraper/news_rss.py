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
from collections.abc import Callable, Sequence
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
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
PUBLISHER_HOSTS = {
    "ESPN": {"espn.com", "www.espn.com"},
    "NCAA.com": {"ncaa.com", "www.ncaa.com"},
}


def permitted_source_url(value: str, publisher: str) -> bool:
    """Accept only HTTPS links on the publisher's own host.

    RSS is a source of publisher context, so redirects, tracking hosts and
    cross-site links are withheld before they enter the retained release.
    Unknown publisher labels are allowed for test/custom feeds but still must
    use HTTPS and a hostname.
    """
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    allowed = PUBLISHER_HOSTS.get(publisher)
    return parsed.scheme.lower() == "https" and not parsed.username and not parsed.password and bool(host) and (allowed is None or host in allowed)


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
        if not title or not link or not published_raw or not permitted_source_url(link, publisher):
            continue
        # ESPN's broad NCB feed occasionally carries football or general
        # college-sports items. Keep the published sport label truthful by
        # accepting only URLs in ESPN's explicit men's-college-basketball
        # namespace. NCAA.com supplies a basketball-only feed and is left
        # unchanged.
        if publisher == "ESPN" and sport == "mens-college-basketball":
            path = urlsplit(link).path.rstrip("/")
            if "/mens-college-basketball/" not in f"{path}/":
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


def build_release(
    *,
    feeds: tuple[dict, ...] = FEEDS,
    limit: int = 40,
    previous_articles: Sequence[dict] = (),
    fetcher: Callable[[str], bytes] | None = None,
) -> dict:
    started = time.time()
    articles: list[dict] = []
    feed_errors: list[dict[str, object]] = []
    fetch = fetcher or fetch_feed
    for index, feed in enumerate(feeds):
        if index:
            time.sleep(1.0)
        publisher = str(feed["publisher"])
        sport = str(feed["sport"])
        feed_url = str(feed["url"])
        try:
            parsed = parse_rss(
                fetch(feed_url),
                feed_url=feed_url,
                publisher=publisher,
                sport=sport,
            )
        except (ET.ParseError, OSError, URLError, TimeoutError) as error:
            # A transient empty or blocked feed must not erase a previously
            # published source edition. Keep the source-specific rows and
            # expose the failure in release metadata so the stale boundary is
            # visible to operators and readers.
            parsed = [
                article
                for article in previous_articles
                if article.get("publisher") == publisher
                and article.get("sport") == sport
            ]
            feed_errors.append(
                {
                    "publisher": publisher,
                    "url": feed_url,
                    "error": type(error).__name__,
                    "fallback_articles": len(parsed),
                }
            )
        articles.extend(parsed)
    if feed_errors and not articles:
        raise RuntimeError("All publisher feeds failed and no prior release is available")
    # A source can legitimately appear in both a retained release and a
    # successful refresh. Keep the newest copy of each stable feed identity.
    deduped: dict[str, dict] = {}
    for article in articles:
        article_id = str(article.get("id") or "")
        if article_id:
            deduped[article_id] = article
    articles = list(deduped.values())
    articles.sort(key=lambda article: article["published"], reverse=True)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    release = {
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
    if feed_errors:
        release["attribution"]["feed_errors"] = feed_errors
    return release


def write_release(output: Path = DEFAULT_OUTPUT, *, feeds: tuple[dict, ...] = FEEDS, limit: int = 40) -> dict:
    previous_articles: Sequence[dict] = ()
    if output.exists():
        try:
            previous = json.loads(output.read_text())
            if isinstance(previous, dict) and isinstance(previous.get("articles"), list):
                previous_articles = [item for item in previous["articles"] if isinstance(item, dict)]
        except (OSError, json.JSONDecodeError):
            # A malformed prior release should not be used as a fallback;
            # the new source payload still gets a normal parse attempt.
            previous_articles = ()
    release = build_release(
        feeds=feeds,
        limit=limit,
        previous_articles=previous_articles,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(release, ensure_ascii=False, separators=(",", ":")) + "\n")
    return release


if __name__ == "__main__":
    release = write_release()
    print(json.dumps({"articles": len(release["articles"]), "generated_at": release["generated_at"]}))
