"""Attributed bulk imports; never scrape ESPN/NCAA or circumvent source controls."""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".local" / "football"
RELEASES = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
ATTRIBUTION = {
    "name": "SportsDataverse",
    "url": "https://github.com/sportsdataverse/sportsdataverse-data",
    "license": "CC BY 4.0 (dataset license stated in publisher README)",
    "license_url": "https://creativecommons.org/licenses/by/4.0/",
    "changes": "Normalized records, aggregated statistics, and independent Silvermine model estimates.",
    "upstream": "ESPN / CollegeFootballData via SportsDataverse; no direct source scraping.",
}
DATASETS = {
    "schedule": ("cfb_schedules", "cfb_schedules_{year}.csv.gz"),
    "teams": ("espn_cfb_teams", "cfb_teams_{year}.csv"),
    "box": ("espn_cfb_player_box", "player_box_{year}.csv"),
    "passing": ("espn_cfb_passing", "cfb_passing_{year}.csv"),
    "rushing": ("espn_cfb_rushing", "cfb_rushing_{year}.csv"),
    "receiving": ("espn_cfb_receiving", "cfb_receiving_{year}.csv"),
    "defense": ("espn_cfb_adv_defensive_players", "adv_defensive_players_{year}.csv"),
    "specialists": ("espn_cfb_adv_specialists", "adv_specialists_{year}.csv"),
    "team_advanced": ("espn_cfb_adv_team", "adv_team_{year}.csv"),
    "betting": ("espn_cfb_betting", "betting_{year}.csv"),
    # NCAA-derived player game rows are kept in a separate source namespace.
    # The release has names and team/contest IDs, but no stable athlete ID;
    # callers must not join these rows to the ESPN player archive by name.
    "ncaa_player_stats": ("ncaa_mfb_player_stats", "ncaa_mfb_player_stats_{year}.csv.gz"),
    # The cfbfastR release store also publishes season rosters and recruiting
    # context. These records retain stable provider IDs where supplied and are
    # kept as source evidence separate from the forecast fit.
    "rosters": ("espn_cfb_rosters", "cfb_rosters_{year}.parquet"),
    "recruits": ("cfb_recruits", "cfb_recruits_{year}.parquet"),
    "team_talent": ("cfb_team_talent", "cfb_team_talent_{year}.parquet"),
    "returning_production": ("cfb_returning_production", "cfb_returning_production_{year}.parquet"),
}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SourceUnavailable(RuntimeError):
    pass


class ReleaseClient:
    """Single-threaded, conditional downloads, bounded retries, durable receipts."""

    def __init__(
        self,
        cache: Path = CACHE,
        datasets: dict | None = None,
        attribution: dict | None = None,
    ):
        self.cache = cache
        self.datasets = datasets if datasets is not None else DATASETS
        self.attribution = attribution if attribution is not None else ATTRIBUTION
        cache.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers["User-Agent"] = (
            "SilvermineResearch/1.0 (service@silvermineai.com)"
        )
        self.last_request = 0.0

    @staticmethod
    def _cache_matches_receipt(path: Path, receipt: dict) -> bool:
        """Accept a local release only when its bytes match its receipt."""
        expected = receipt.get("sha256")
        if not path.exists() or not isinstance(expected, str) or len(expected) != 64:
            return False
        try:
            return hashlib.sha256(path.read_bytes()).hexdigest() == expected
        except OSError:
            return False

    def _cached_after_transient_failure(
        self,
        path: Path,
        receipt: dict,
        name: str,
        dataset: str,
        year: int,
        reason: str,
    ) -> tuple[list[dict], dict] | None:
        """Keep a verified prior edition usable when a CDN is temporarily busy.

        A stale copy is only acceptable when its receipt and content hash still
        agree.  The original receipt is returned unchanged so publication
        health can see the true capture clock rather than mistaking a failed
        revalidation for fresh data.
        """
        if not path.exists() or not receipt.get("sha256"):
            return None
        try:
            payload = path.read_bytes()
            if hashlib.sha256(payload).hexdigest() != receipt["sha256"]:
                return None
            rows = parse_release(payload, name)
        except (OSError, KeyError, ValueError, SourceUnavailable):
            return None
        print(
            f"Using verified cached {dataset}/{year} after transient source failure: {reason}",
            file=sys.stderr,
        )
        return rows, receipt

    def load(
        self, dataset: str, year: int, refresh: bool = False
    ) -> tuple[list[dict], dict]:
        tag, template = self.datasets[dataset]
        name = template.format(year=year)
        path = self.cache / name
        receipt_path = self.cache / (name + ".receipt.json")
        receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
        url = f"{RELEASES}/{tag}/{name}"
        cache_verified = self._cache_matches_receipt(path, receipt)
        if refresh or not cache_verified:
            headers = (
                {"If-None-Match": receipt["etag"]}
                if cache_verified and receipt.get("etag")
                else {}
            )
            # Release assets occasionally return a short-lived 5xx while the
            # CDN is materializing a large historical file. Keep retries
            # bounded and single-threaded, but give the publisher enough time
            # to recover before failing an otherwise complete publication.
            retry_delays = (2, 4, 8, 16)
            for attempt in range(len(retry_delays) + 1):
                time.sleep(max(0, 1.0 - (time.monotonic() - self.last_request)))
                self.last_request = time.monotonic()
                try:
                    response = self.session.get(url, headers=headers, timeout=(15, 90))
                except requests.RequestException as exc:
                    if attempt == len(retry_delays):
                        cached = self._cached_after_transient_failure(
                            path, receipt, name, dataset, year, "download failed"
                        )
                        if cached is not None:
                            return cached
                        raise SourceUnavailable(
                            f"Download failed: {dataset}/{year}"
                        ) from exc
                    time.sleep(retry_delays[attempt])
                    continue
                if response.status_code == 304:
                    # The bytes are unchanged, but the conditional request
                    # successfully revalidated the release. Advance the
                    # retrieval clock without changing its hash or ETag.
                    receipt = {
                        **receipt,
                        "dataset": dataset,
                        "season": year,
                        "url": url,
                        "fetched_at": utcnow(),
                        "etag": response.headers.get("ETag") or receipt.get("etag"),
                        "last_modified": response.headers.get("Last-Modified") or receipt.get("last_modified"),
                    }
                    receipt_path.write_text(json.dumps(receipt, indent=2))
                    break
                if response.status_code in (401, 403, 404):
                    raise SourceUnavailable(
                        f"Source unavailable ({response.status_code}): {url}"
                    )
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt == len(retry_delays):
                        cached = self._cached_after_transient_failure(
                            path,
                            receipt,
                            name,
                            dataset,
                            year,
                            f"source returned HTTP {response.status_code}",
                        )
                        if cached is not None:
                            return cached
                        raise SourceUnavailable(
                            f"Source busy: {dataset}/{year}; retry on next run"
                        )
                    retry = response.headers.get("Retry-After", "")
                    if retry.isdigit() and int(retry) > 60:
                        cached = self._cached_after_transient_failure(
                            path,
                            receipt,
                            name,
                            dataset,
                            year,
                            f"source requested a {retry}-second pause",
                        )
                        if cached is not None:
                            return cached
                        raise SourceUnavailable(
                            "Source requested a longer pause; retry later"
                        )
                    time.sleep(int(retry) if retry.isdigit() else retry_delays[attempt])
                    continue
                response.raise_for_status()
                payload = response.content
                # Parse before replacing the last usable download.
                parse_release(payload, name)
                tmp = path.with_suffix(path.suffix + ".tmp")
                tmp.write_bytes(payload)
                tmp.replace(path)
                receipt = {
                    "dataset": dataset,
                    "season": year,
                    "url": url,
                    "fetched_at": utcnow(),
                    "etag": response.headers.get("ETag"),
                    "last_modified": response.headers.get("Last-Modified"),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "attribution": self.attribution,
                }
                receipt_path.write_text(json.dumps(receipt, indent=2))
                break
        return parse_release(path.read_bytes(), name), receipt


def parse_release(payload: bytes, name: str) -> list[dict]:
    if name.endswith(".parquet"):
        import pyarrow.parquet as pq

        rows = pq.read_table(io.BytesIO(payload)).to_pylist()

        def source_value(v):
            if v is None:
                return ""
            if isinstance(v, bool):
                return "true" if v else "false"
            if isinstance(v, (dict, list)):
                return json.dumps(v, default=str)
            if isinstance(v, datetime):
                return v.isoformat().replace("+00:00", "Z")
            return str(v)

        return [{k: source_value(v) for k, v in row.items()} for row in rows]
    return parse_csv(payload, name)


def parse_csv(payload: bytes, name: str) -> list[dict]:
    if name.endswith(".gz"):
        payload = gzip.decompress(payload)
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig")))
    if not reader.fieldnames or len(reader.fieldnames) < 2:
        raise SourceUnavailable("Expected a tabular CSV release")
    return [dict(row) for row in reader]
