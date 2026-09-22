"""Archive NCAA source releases and derived player statistics in R2.

The national player release is a normalized public derivative of cached NCAA
ranking pages.  It is archived alongside the source Parquet partitions so the
edition used by the rankings API can be recovered and checked by hash.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Iterable

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local/basketball"
sys.path.insert(0, str(ROOT / "ncaa_scraper"))

INCREMENTAL = os.getenv("BASKETBALL_D1_INCREMENTAL") == "1"


def publish_seasons(seasons: Iterable[int]) -> list[int]:
    """Return only the live season during scheduled maintenance.

    Source objects are content-addressed, so re-uploading unchanged historical
    partitions adds latency without changing the publication. Full rebuilds
    retain the original all-season archive behavior.
    """
    values = list(seasons)
    return [max(values)] if INCREMENTAL and values else values


def put(path: Path, key: str, content_type: str) -> None:
    """Upload one verified object through the repository's credential helper."""
    subprocess.run(
        [
            sys.executable,
            "scripts/cloudflare.py",
            "r2",
            "object",
            "put",
            key,
            "--file",
            str(path.resolve()),
            "--content-type",
            content_type,
            "--remote",
        ],
        cwd=ROOT,
        check=True,
    )


def archive(dataset: str, stem: str, seasons: Iterable[int], prefix: str) -> None:
    for season in seasons:
        source = LOCAL / f"{stem}_{season}.parquet"
        receipt_path = source.with_name(source.name + ".receipt.json")
        if not source.exists() or not receipt_path.exists():
            raise SystemExit(f"Missing {dataset} source for {season}")
        receipt = json.loads(receipt_path.read_text())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if receipt.get("sha256") != digest:
            raise SystemExit(f"Source receipt mismatch for {dataset} {season}")
        key = f"bball-research/basketball/{prefix}/{season}/{digest}"
        for path, suffix, content_type in (
            (source, ".parquet", "application/vnd.apache.parquet"),
            (receipt_path, ".receipt.json", "application/json"),
        ):
            put(path, key + suffix, content_type)
        print(f"Archived NCAA {dataset} {season}", flush=True)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_national_individual_release(payload: dict[str, object]) -> dict[str, object]:
    """Require the exact-ID box supplement before archiving the derivative.

    ``ncaa_individual.py`` intentionally only captures the NCAA national
    ranking pages.  The publisher adds the exact-ID box supplement in a
    separate step, so archiving a raw intermediate snapshot would make an
    incomplete release durable.  Reuse the publication-health contract here
    at the archive boundary as well as at the deploy gate.
    """
    try:
        from ncaa_scraper.publication_health import _ncaa_individual_health

        return _ncaa_individual_health(payload)
    except ValueError as exc:
        raise ValueError(
            "NCAA individual release is not publication-ready; run "
            "ncaa_individual_enrichment before archiving: " + str(exc)
        ) from exc


def archive_national_individual(season: int = 2026) -> dict[str, object]:
    """Archive the NCAA national player derivative and an explicit receipt.

    This file is not an NCAA page mirror: it contains normalized values and
    retained source cells.  The receipt states that distinction and keeps the
    derivative hash separate from any exact-ID box-stat supplement hash.
    """
    source = ROOT / "frontend/public/data/basketball/ncaa-individual.json"
    if not source.exists():
        raise SystemExit(f"Missing NCAA individual release: {source}")
    try:
        payload = json.loads(source.read_text())
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit("NCAA individual release is not valid JSON") from exc
    if not isinstance(payload, dict) or payload.get("season") != season:
        raise SystemExit(f"NCAA individual release has unexpected season (wanted {season})")
    try:
        validate_national_individual_release(payload)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    generated_at = payload.get("generated_at")
    if not isinstance(generated_at, str):
        raise SystemExit("NCAA individual release has no source capture timestamp")
    # Validate the timestamp before it enters a receipt that downstream health
    # checks may treat as the source clock.
    try:
        datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SystemExit("NCAA individual release has an invalid source timestamp") from exc
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    receipt = {
        "dataset": "ncaa_individual",
        "season": season,
        "url": "https://stats.ncaa.org/rankings/national_ranking",
        "fetched_at": generated_at,
        "archived_at": utcnow(),
        "sha256": digest,
        "kind": "normalized_public_derivative",
        "method": "Cached final NCAA national-ranking snapshots fetched only when robots.txt permits; source cells are retained for audit and values are normalized for the rankings API.",
        "attribution": {
            "publisher": "NCAA Statistics",
            "upstream": "NCAA Statistics",
            "source_policy": "robots.txt checked before every live fetch; cached editions are reused when a refresh cannot be verified.",
        },
    }
    receipt_path = LOCAL / f"ncaa-individual-{season}.json.receipt.json"
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    key = f"bball-research/basketball/ncaa-individual/{season}/{digest}"
    put(source, key + ".json", "application/json")
    put(receipt_path, key + ".receipt.json", "application/json")
    print(f"Archived NCAA national individual derivative {season} ({digest})", flush=True)
    return receipt


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only-ncaa-individual",
        action="store_true",
        help="Archive only the current national NCAA player derivative.",
    )
    args = parser.parse_args(argv)
    if args.only_ncaa_individual:
        archive_national_individual()
        return
    archive("roster", "ncaa_mbb_team_rosters", publish_seasons(range(2010, 2027)), "ncaa-rosters")
    archive("shot", "ncaa_mbb_shots", publish_seasons(range(2019, 2027)), "ncaa-shots")
    archive("league RAPM", "ncaa_mbb_rapm", publish_seasons(range(2011, 2027)), "ncaa-rapm")
    archive("standings", "standings", publish_seasons(range(2003, 2027)), "standings")
    archive_national_individual()


if __name__ == "__main__":
    main()
