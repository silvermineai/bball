#!/usr/bin/env python3
"""Revalidate curated school recruiting announcements without copying pages.

The recruiting release contains a bounded set of exact school news URLs that
were reviewed by a human. This job only checks robots permission, fetches a
small HTML prefix, and confirms the page title still matches the retained
record. It never stores page content or follows links. Review timestamps move
only after that check succeeds.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/recruiting/announcements.json"
USER_AGENT = "SilvermineResearch/1.0 (+https://bball.silvermine.dev/)"
MAX_BYTES = 320_000
TIMEOUT = 20
TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title\s*>", re.IGNORECASE | re.DOTALL)
OG_TITLE_RE = re.compile(
    r"<meta\b[^>]+(?:property|name)=[\"']og:title[\"'][^>]+content=[\"'](.*?)[\"']",
    re.IGNORECASE | re.DOTALL,
)


def clean_title(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def extract_title(payload: bytes) -> str | None:
    text = payload.decode("utf-8", "ignore")
    match = TITLE_RE.search(text) or OG_TITLE_RE.search(text)
    return clean_title(match.group(1)) if match else None


def title_matches(expected: str, actual: str | None) -> bool:
    if not actual:
        return False
    expected_words = [word for word in re.findall(r"[a-z0-9]+", expected.casefold()) if len(word) > 2]
    observed = set(re.findall(r"[a-z0-9]+", actual.casefold()))
    # School templates append a brand suffix, so require the meaningful words
    # from the reviewed headline rather than an exact string match.
    return bool(expected_words) and sum(word in observed for word in expected_words) >= max(2, len(expected_words) - 1)


def robots_allowed(url: str, cache: dict[str, RobotFileParser]) -> bool:
    parsed = urlsplit(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    parser = cache.get(origin)
    if parser is None:
        parser = RobotFileParser(f"{origin}/robots.txt")
        try:
            parser.read()
        except OSError:
            # A robots failure is an unknown permission state. Fail closed.
            return False
        cache[origin] = parser
    return parser.can_fetch(USER_AGENT, url)


def fetch_title(url: str) -> str | None:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urlopen(request, timeout=TIMEOUT) as response:
        if not (200 <= response.status < 300):
            return None
        content_type = (response.headers.get("content-type") or "").casefold()
        if content_type and "html" not in content_type and "xhtml" not in content_type:
            return None
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            body = body[:MAX_BYTES]
        return extract_title(body)


def revalidate_document(document: dict, *, fetcher=fetch_title, sleep_seconds: float = 1.0) -> tuple[dict, dict]:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    robots: dict[str, RobotFileParser] = {}
    updated = 0
    skipped = 0
    errors: list[dict[str, str]] = []
    sources = []
    for index, source in enumerate(document.get("sources", [])):
        source = dict(source)
        url = str(source.get("url") or "")
        try:
            if not url.startswith("https://") or not robots_allowed(url, robots):
                skipped += 1
            else:
                actual = fetcher(url)
                if title_matches(str(source.get("title") or ""), actual):
                    source["checked_at"] = now
                    updated += 1
                else:
                    skipped += 1
                    errors.append({"id": str(source.get("id") or ""), "error": "title_mismatch"})
        except Exception as error:  # noqa: BLE001 - one stale school must not erase the release
            skipped += 1
            errors.append({"id": str(source.get("id") or ""), "error": type(error).__name__})
        sources.append(source)
        if index + 1 < len(document.get("sources", [])):
            time.sleep(max(0.0, sleep_seconds))
    refreshed = {**document, "sources": sources}
    return refreshed, {"checked": len(sources), "updated": updated, "skipped": skipped, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="atomically write successful review clocks")
    parser.add_argument("--sleep", type=float, default=1.0, help="seconds between school requests")
    args = parser.parse_args()
    document = json.loads(SOURCE.read_text())
    refreshed, report = revalidate_document(document, sleep_seconds=args.sleep)
    if args.write and report["updated"]:
        with tempfile.NamedTemporaryFile("w", dir=SOURCE.parent, prefix=f".{SOURCE.name}.", delete=False) as handle:
            json.dump(refreshed, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            temp = Path(handle.name)
        temp.replace(SOURCE)
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
