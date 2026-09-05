"""Cache reader and robots-respecting NCAA fetcher; no anti-bot bypass."""

from __future__ import annotations

import hashlib
import logging
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import requests
from pathlib import Path

logger = logging.getLogger(__name__)


class NCAAFetchError(RuntimeError):
    pass


class ScraplingNCAAFetcher:
    """Read cached NCAA pages; require robots permission for every live fetch."""

    base_url = "https://stats.ncaa.org"

    def __init__(
        self,
        cache_dir: str | Path | None = None,
        delay_seconds: float = 2.0,
        timeout: int = 45,
        prefer_dynamic: bool = False,
    ) -> None:
        self.cache_dir = Path(cache_dir) if cache_dir is not None else Path(__file__).resolve().parent / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay_seconds = delay_seconds
        self.timeout = timeout
        self.prefer_dynamic = prefer_dynamic
        self._last_fetch_at = 0.0

    def fetch(self, path_or_url: str, cache_key: str | None = None, force: bool = False) -> str:
        url = self.normalize_url(path_or_url)
        cache_path = self.cache_dir / f"{cache_key or self.cache_key(url)}.html"
        if cache_path.exists() and not force:
            return cache_path.read_text(encoding="utf-8")

        self._throttle()
        html = self._fetch_with_scrapling(url)
        if self._looks_blocked(html):
            raise NCAAFetchError(f"NCAA returned an anti-bot/interstitial page for {url}")

        cache_path.write_text(html, encoding="utf-8")
        return html

    def normalize_url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http"):
            return path_or_url
        if not path_or_url.startswith("/"):
            path_or_url = f"/{path_or_url}"
        return f"{self.base_url}{path_or_url}"

    def cache_key(self, url: str) -> str:
        safe = url.replace(self.base_url, "").strip("/").replace("/", "_").replace("?", "_")
        if len(safe) <= 180:
            return safe
        return hashlib.sha1(url.encode("utf-8")).hexdigest()

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_fetch_at
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)
        self._last_fetch_at = time.monotonic()

    def _fetch_with_scrapling(self, url: str) -> str:
        # Historical method name retained for compatibility with existing callers.
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc != "stats.ncaa.org":
            raise NCAAFetchError("Only HTTPS stats.ncaa.org URLs are accepted")
        agent = "SilvermineResearch/1.0 (service@silvermineai.com)"
        robots = requests.get(f"{parts.scheme}://{parts.netloc}/robots.txt",
                              headers={"User-Agent": agent}, timeout=self.timeout)
        if robots.status_code != 200:
            raise NCAAFetchError("Cannot verify NCAA robots policy; no page requested")
        policy = RobotFileParser()
        policy.parse(robots.text.splitlines())
        if not policy.can_fetch(agent, url):
            raise NCAAFetchError("NCAA robots.txt disallows this request; use an authorized data release")
        delay = policy.crawl_delay(agent) or policy.crawl_delay("*")
        if delay:
            time.sleep(max(float(delay), self.delay_seconds))
        response = requests.get(url, headers={"User-Agent": agent}, timeout=self.timeout)
        if response.status_code in (401, 403, 429):
            raise NCAAFetchError(f"NCAA returned {response.status_code}; no bypass or retry attempted")
        response.raise_for_status()
        return response.text

    @staticmethod
    def _looks_blocked(html: str) -> bool:
        markers = ("akamai_validation", "bm-verify", "request_quota_reached")
        return any(marker in html for marker in markers)
