"""Polite Scrapling-backed fetching with durable HTML cache."""

from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)


class NCAAFetchError(RuntimeError):
    pass


class ScraplingNCAAFetcher:
    """Fetch NCAA stats pages through Scrapling and cache every successful page."""

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
        try:
            from scrapling.fetchers import Fetcher
        except ImportError as exc:
            raise NCAAFetchError("Install scrapling to fetch live NCAA pages.") from exc

        logger.info("Fetching NCAA page: %s", url)
        page = Fetcher.get(
            url,
            impersonate="chrome",
            stealthy_headers=True,
            timeout=self.timeout,
        )
        html = str(page.body) if not isinstance(page.body, str) else page.body
        if not self._looks_blocked(html) and not self.prefer_dynamic:
            return html

        from scrapling.fetchers import StealthyFetcher

        page = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            timeout=self.timeout * 1000,
        )
        return str(page.body) if not isinstance(page.body, str) else page.body

    @staticmethod
    def _looks_blocked(html: str) -> bool:
        markers = ("akamai_validation", "bm-verify", "request_quota_reached")
        return any(marker in html for marker in markers)
