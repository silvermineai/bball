"""Attributed bulk imports; never scrape ESPN/NCAA or circumvent source controls."""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
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
}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SourceUnavailable(RuntimeError):
    pass


class ReleaseClient:
    """Single-threaded, conditional downloads, bounded retries, durable receipts."""

    def __init__(self, cache: Path = CACHE):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers["User-Agent"] = (
            "SilvermineResearch/1.0 (service@silvermineai.com)"
        )
        self.last_request = 0.0

    def load(
        self, dataset: str, year: int, refresh: bool = False
    ) -> tuple[list[dict], dict]:
        tag, template = DATASETS[dataset]
        name = template.format(year=year)
        path = self.cache / name
        receipt_path = self.cache / (name + ".receipt.json")
        receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
        url = f"{RELEASES}/{tag}/{name}"
        if refresh or not path.exists() or not receipt:
            headers = (
                {"If-None-Match": receipt["etag"]}
                if path.exists() and receipt.get("etag")
                else {}
            )
            for attempt in range(3):
                time.sleep(max(0, 1.0 - (time.monotonic() - self.last_request)))
                self.last_request = time.monotonic()
                try:
                    response = self.session.get(url, headers=headers, timeout=(15, 90))
                except requests.RequestException as exc:
                    if attempt == 2:
                        raise SourceUnavailable(
                            f"Download failed: {dataset}/{year}"
                        ) from exc
                    time.sleep(2**attempt)
                    continue
                if response.status_code == 304:
                    break
                if response.status_code in (401, 403, 404):
                    raise SourceUnavailable(
                        f"Source unavailable ({response.status_code}): {url}"
                    )
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt == 2:
                        raise SourceUnavailable(
                            f"Source busy: {dataset}/{year}; retry on next run"
                        )
                    retry = response.headers.get("Retry-After", "")
                    if retry.isdigit() and int(retry) > 60:
                        raise SourceUnavailable(
                            "Source requested a longer pause; retry later"
                        )
                    time.sleep(int(retry) if retry.isdigit() else 2 ** (attempt + 1))
                    continue
                response.raise_for_status()
                payload = response.content
                # Parse before replacing the last usable download.
                parse_csv(payload, name)
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
                    "attribution": ATTRIBUTION,
                }
                receipt_path.write_text(json.dumps(receipt, indent=2))
                break
        return parse_csv(path.read_bytes(), name), receipt


def parse_csv(payload: bytes, name: str) -> list[dict]:
    if name.endswith(".gz"):
        payload = gzip.decompress(payload)
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig")))
    if not reader.fieldnames or len(reader.fieldnames) < 2:
        raise SourceUnavailable("Expected a tabular CSV release")
    return [dict(row) for row in reader]
