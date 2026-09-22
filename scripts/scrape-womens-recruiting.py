"""Capture a bounded, source-labeled ESPN women's basketball recruiting cohort.

The public endpoint currently publishes exact recruit IDs and grades for the
2027 women's class, but it does not publish national ranks or commitments for
every row. Those fields remain null in the release; no men's recruiting row or
team name is joined into this artifact.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "frontend/public/data/basketball/womens-recruiting.json"
BASE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/womens-college-basketball"
LIST_URL = BASE + "/seasons/{season}/recruits?limit=200"
DETAIL_URL = BASE + "/recruits/{athlete_id}?lang=en&region=us"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


def fetch(url: str) -> tuple[dict, bytes]:
    response = requests.get(url, headers={"Accept": "application/json", "User-Agent": "SilvermineResearch/1.0"}, timeout=(5, 30))
    response.raise_for_status()
    if len(response.content) > MAX_RESPONSE_BYTES:
        raise RuntimeError("women's recruiting response exceeds the 2 MB bound")
    value = response.json()
    if not isinstance(value, dict):
        raise ValueError("women's recruiting response is not an object")
    return value, response.content


def listed_ids(payload: dict) -> list[str]:
    items = payload.get("items")
    if (
        not isinstance(items, list)
        or not items
        or payload.get("count") != len(items)
        or payload.get("pageIndex") != 1
        or payload.get("pageCount") != 1
        or not isinstance(payload.get("pageSize"), int)
        or payload["pageSize"] < len(items)
    ):
        raise ValueError("women's recruiting list is incomplete or malformed")
    ids: list[str] = []
    for item in items:
        ref = item.get("$ref") if isinstance(item, dict) else None
        match = re.search(r"/recruits/(\d+)(?:\?|$)", ref or "") if isinstance(ref, str) else None
        if not match:
            raise ValueError("women's recruiting list contains an invalid recruit reference")
        ids.append(match.group(1))
    if len(set(ids)) != len(ids):
        raise ValueError("women's recruiting list contains duplicate recruit IDs")
    return ids


def number(value: object) -> float | int | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or abs(parsed) == float("inf"):
        return None
    return int(parsed) if parsed.is_integer() else parsed


def positive_rank(value: object) -> int | None:
    parsed = number(value)
    return int(parsed) if isinstance(parsed, (int, float)) and parsed > 0 and float(parsed).is_integer() else None


def normalize(detail: dict, athlete_id: str, raw_body: bytes, season: int, captured_at: str) -> dict:
    athlete = detail.get("athlete")
    if not isinstance(athlete, dict) or str(athlete.get("id")) != athlete_id:
        raise ValueError("women's recruiting detail identity does not match the list")
    name = str(athlete.get("displayName") or athlete.get("fullName") or "").strip()
    if not name or len(name) > 160:
        raise ValueError("women's recruiting detail has no valid name")
    position = athlete.get("position")
    hometown = athlete.get("hometown") if isinstance(athlete.get("hometown"), dict) else {}
    high_school = athlete.get("highSchool") if isinstance(athlete.get("highSchool"), dict) else {}
    status = detail.get("status") if isinstance(detail.get("status"), dict) else {}
    attributes = {str(row.get("name")): row.get("value") for row in detail.get("attributes", []) if isinstance(row, dict) and row.get("name")}
    return {
        "athlete_id": athlete_id,
        "name": name,
        "position": position.get("abbreviation") if isinstance(position, dict) else None,
        "grade": number(detail.get("grade")),
        "rank": positive_rank(attributes.get("rank")),
        "position_rank": positive_rank(attributes.get("positionRank")),
        "state_rank": positive_rank(attributes.get("stateRank")),
        "region_rank": positive_rank(attributes.get("regionRank")),
        "status": status.get("description") if isinstance(status.get("description"), str) else None,
        "committed_team_id": None,
        "committed_team_name": None,
        "high_school": high_school.get("name") if isinstance(high_school.get("name"), str) else None,
        "hometown": ", ".join(str(value).strip() for value in (hometown.get("city"), hometown.get("stateAbbreviation") or hometown.get("state")) if value),
        "height_inches": number(athlete.get("height")),
        "weight_pounds": number(athlete.get("weight")),
        "source_sha256": hashlib.sha256(raw_body).hexdigest(),
        "source_url": DETAIL_URL.format(athlete_id=athlete_id),
        "recruiting_class": season,
        "captured_at": captured_at,
    }


def capture(season: int = 2027, workers: int = 8) -> dict:
    if not 2025 <= season <= 2035 or not 1 <= workers <= 8:
        raise ValueError("season or worker count is outside the capture bound")
    listing, listing_body = fetch(LIST_URL.format(season=season))
    ids = listed_ids(listing)
    captured_at = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    def load(athlete_id: str) -> dict:
        detail, body = fetch(DETAIL_URL.format(athlete_id=athlete_id))
        return normalize(detail, athlete_id, body, season, captured_at)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        records = list(pool.map(load, ids))
    records.sort(key=lambda row: (row["grade"] is None, -(row["grade"] or 0), row["name"], row["athlete_id"]))
    edition = hashlib.sha256(json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "season": season,
        "edition": edition,
        "captured_at": captured_at,
        "source": {
            "publisher": "ESPN",
            "league": "womens-college-basketball",
            "list_url": LIST_URL.format(season=season),
            "list_sha256": hashlib.sha256(listing_body).hexdigest(),
            "detail_url_template": DETAIL_URL,
            "receipt_count": len(records) + 1,
            "identity_policy": "ESPN recruit athlete IDs remain in a women-specific namespace; no men's recruiting row or team identity is joined.",
        },
        "coverage": {
            "prospects": len(records),
            "graded": sum(row["grade"] is not None for row in records),
            "ranked": sum(row["rank"] is not None for row in records),
            "committed": sum(row["committed_team_id"] is not None for row in records),
        },
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2027)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    artifact = capture(args.season, args.workers)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"season": artifact["season"], "edition": artifact["edition"], **artifact["coverage"], "output": str(args.output)}, indent=2))


if __name__ == "__main__":
    main()
