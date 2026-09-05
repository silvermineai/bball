"""Bounded, streaming downloads for large attributed SportsDataverse releases."""

from __future__ import annotations

import hashlib
import json
import time

import pyarrow.parquet as pq
import requests

from .football_sources import RELEASES, SourceUnavailable, utcnow


def parquet_file(client, dataset, year, refresh=False, max_bytes=256 * 1024 * 1024):
    tag, template = client.datasets[dataset]
    name = template.format(year=year)
    path = client.cache / name
    receipt_path = client.cache / (name + ".receipt.json")
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
    url = f"{RELEASES}/{tag}/{name}"
    if not refresh and path.exists() and receipt:
        digest = hashlib.sha256()
        with path.open("rb") as cached:
            for chunk in iter(lambda: cached.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != receipt["sha256"]:
            raise SourceUnavailable("Cached release hash differs from its receipt")
        pq.ParquetFile(path)
        return path, receipt
    headers = (
        {"If-None-Match": receipt["etag"]}
        if path.exists() and receipt.get("etag")
        else {}
    )
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        for attempt in range(3):
            time.sleep(max(0, 1 - (time.monotonic() - client.last_request)))
            client.last_request = time.monotonic()
            try:
                with client.session.get(
                    url, headers=headers, stream=True, timeout=(15, 90)
                ) as response:
                    if response.status_code == 304:
                        return parquet_file(client, dataset, year, False, max_bytes)
                    if response.status_code in (401, 403, 404):
                        raise SourceUnavailable(
                            f"Source unavailable ({response.status_code}): {dataset}/{year}"
                        )
                    if response.status_code == 429 or response.status_code >= 500:
                        retry = response.headers.get("Retry-After", "")
                        if attempt == 2 or (retry.isdigit() and int(retry) > 60):
                            raise SourceUnavailable("Source busy; retry on a later run")
                        time.sleep(
                            int(retry) if retry.isdigit() else 2 ** (attempt + 1)
                        )
                        continue
                    response.raise_for_status()
                    size, digest = 0, hashlib.sha256()
                    with tmp.open("wb") as output:
                        for chunk in response.iter_content(1024 * 1024):
                            size += len(chunk)
                            if size > max_bytes:
                                raise SourceUnavailable(
                                    "Release exceeds the configured download bound"
                                )
                            output.write(chunk)
                            digest.update(chunk)
                    pq.ParquetFile(
                        tmp
                    )  # Validate the footer before replacing a good cache.
                    receipt = {
                        "dataset": dataset,
                        "season": year,
                        "url": url,
                        "fetched_at": utcnow(),
                        "etag": response.headers.get("ETag"),
                        "last_modified": response.headers.get("Last-Modified"),
                        "sha256": digest.hexdigest(),
                        "attribution": client.attribution,
                    }
                    tmp.replace(path)
                    receipt_path.write_text(json.dumps(receipt, indent=2))
                    return path, receipt
            except requests.RequestException as exc:
                if attempt == 2:
                    raise SourceUnavailable(
                        f"Download failed: {dataset}/{year}"
                    ) from exc
                time.sleep(2**attempt)
    finally:
        tmp.unlink(missing_ok=True)
    raise SourceUnavailable("No usable release was downloaded")
