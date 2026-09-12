"""Fetch a bounded, source-labeled ESPN men's basketball recruiting release.

The endpoint exposes prospect rankings and commitment status, not transfer
eligibility. Raw responses stay in the ignored local cache; the D1 release
contains only normalized fields, source URLs and hashes for attribution.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import requests

from .football_sources import ROOT

PROVIDER = "ESPN Recruiting"
BASE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball"
LIST_URL = BASE + "/seasons/{season}/recruits?limit=500"
DETAIL_URL = BASE + "/recruits/{athlete_id}?lang=en&region=us"
CACHE = ROOT / ".local/recruiting/espn"
MIGRATION = ROOT / "worker/migrations/0033_espn_recruiting.sql"
DEFAULT_SQL = ROOT / ".local/espn-recruiting.sql"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
USER_AGENT = "SilvermineResearch/1.0 (bball.silvermine.dev)"


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(compact(value).encode("utf-8")).hexdigest()


def _fetch(url: str) -> tuple[dict, bytes]:
    with requests.get(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}, timeout=(5, 20), stream=True, allow_redirects=False) as response:
        if response.status_code != 200:
            raise RuntimeError(f"ESPN recruiting source unavailable ({response.status_code})")
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_RESPONSE_BYTES:
                raise RuntimeError("ESPN recruiting response exceeds the 2 MB bound")
            chunks.append(chunk)
        body = b"".join(chunks)
    if len(body) > MAX_RESPONSE_BYTES:
        raise RuntimeError("ESPN recruiting response exceeds the 2 MB bound")
    try:
        value = json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError("ESPN recruiting response is not valid UTF-8 JSON") from error
    if not isinstance(value, dict):
        raise RuntimeError("ESPN recruiting response must be an object")
    return value, body


def _id_from_ref(value: object, kind: str) -> str | None:
    if not isinstance(value, str):
        return None
    match = re.search(rf"/{kind}/(\d+)(?:\?|$)", value)
    return match.group(1) if match else None


def _number(value: object, *, integer: bool = False) -> float | int | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or abs(parsed) == float("inf"):
        return None
    return int(parsed) if integer else parsed


def _team_names() -> dict[str, str]:
    path = ROOT / ".local/basketball.sqlite3"
    if not path.exists():
        return {}
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        names: dict[str, str] = {}
        for row in conn.execute("SELECT team_id,profile_json FROM bb_rosters"):
            try:
                profile = json.loads(row[1])
            except (TypeError, ValueError):
                profile = {}
            team_name = profile.get("team_display_name") if isinstance(profile, dict) else None
            if team_name:
                names.setdefault(str(row[0]), str(team_name))
        for row in conn.execute("SELECT home_id,home_name FROM bb_games UNION SELECT away_id,away_name FROM bb_games"):
            names.setdefault(str(row[0]), str(row[1]))
        return names
    finally:
        conn.close()


def normalize_detail(detail: dict, season: int, captured_at: str, team_names: dict[str, str], raw_body: bytes) -> dict:
    athlete = detail.get("athlete")
    if not isinstance(athlete, dict) or not str(athlete.get("id", "")).isdigit():
        raise ValueError("Missing ESPN recruit identity")
    athlete_id = str(athlete["id"])
    name = str(athlete.get("displayName") or athlete.get("fullName") or "").strip()
    if not name or len(name) > 160:
        raise ValueError("Missing ESPN recruit name")
    attributes = {
        str(item.get("name")): item.get("value")
        for item in detail.get("attributes", [])
        if isinstance(item, dict) and item.get("name")
    }
    schools: list[str] = []
    committed_id = None
    committed_name = None
    for school in detail.get("schools", []):
        if not isinstance(school, dict):
            continue
        team = school.get("team")
        team_id = _id_from_ref(team.get("$ref") if isinstance(team, dict) else None, "teams")
        if not team_id:
            continue
        schools.append(team_id)
        status = school.get("status")
        description = str(status.get("description", "")).strip() if isinstance(status, dict) else ""
        status_id = status.get("id") if isinstance(status, dict) else None
        if committed_id is None and description.casefold() not in {"", "undecided", "unknown", "offer"} and status_id not in (None, 0, "0"):
            committed_id, committed_name = team_id, team_names.get(team_id)
    hometown = athlete.get("hometown")
    hometown_text = None
    if isinstance(hometown, dict):
        hometown_text = ", ".join(str(value).strip() for value in (hometown.get("city"), hometown.get("stateAbbreviation") or hometown.get("state")) if value)
    high_school = athlete.get("highSchool")
    payload = {
        "athlete_id": athlete_id,
        "name": name,
        "position": (athlete.get("position") or {}).get("abbreviation") if isinstance(athlete.get("position"), dict) else None,
        "grade": _number(detail.get("grade")),
        "rank": _number(attributes.get("rank"), integer=True),
        "position_rank": _number(attributes.get("positionRank"), integer=True),
        "state_rank": _number(attributes.get("stateRank"), integer=True),
        "region_rank": _number(attributes.get("regionRank"), integer=True),
        "status": (detail.get("status") or {}).get("description") if isinstance(detail.get("status"), dict) else None,
        "committed_team_id": committed_id,
        "committed_team_name": committed_name,
        "school_ids": sorted(set(schools)),
        "high_school": (high_school or {}).get("name") if isinstance(high_school, dict) else None,
        "hometown": hometown_text,
        "height_inches": _number(athlete.get("height")),
        "weight_pounds": _number(athlete.get("weight")),
        "recruiting_class": season,
    }
    payload["source_sha256"] = hashlib.sha256(raw_body).hexdigest()
    payload["source_url"] = DETAIL_URL.format(athlete_id=athlete_id)
    payload["captured_at"] = captured_at
    return payload


def fetch_release(season: int = 2027, workers: int = 4) -> dict:
    if not 2025 <= season <= 2035:
        raise ValueError("Recruiting season must be between 2025 and 2035")
    if not 1 <= workers <= 8:
        raise ValueError("workers must be between 1 and 8")
    listing, listing_body = _fetch(LIST_URL.format(season=season))
    refs = listing.get("items")
    if not isinstance(refs, list) or not refs or len(refs) > 500:
        raise ValueError("ESPN recruiting list is missing or outside the bound")
    athlete_ids = sorted({athlete_id for athlete_id in (_id_from_ref(item.get("$ref") if isinstance(item, dict) else None, "recruits") for item in refs) if athlete_id})
    if not athlete_ids:
        raise ValueError("ESPN recruiting list contains no athlete IDs")
    captured_at = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    CACHE.mkdir(parents=True, exist_ok=True)
    team_names = _team_names()
    records: list[dict] = []

    def load(athlete_id: str) -> dict | None:
        url = DETAIL_URL.format(athlete_id=athlete_id)
        try:
            detail, body = _fetch(url)
            (CACHE / f"{season}-{athlete_id}.json").write_bytes(body)
            return normalize_detail(detail, season, captured_at, team_names, body)
        except (OSError, RuntimeError, TypeError, ValueError, UnicodeError, json.JSONDecodeError, requests.RequestException):
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for record in pool.map(load, athlete_ids):
            if record:
                records.append(record)
    records.sort(key=lambda row: (row.get("rank") is None, row.get("rank") or 10**6, row["athlete_id"]))
    if not records:
        raise RuntimeError("ESPN recruiting detail refresh returned no valid records")
    edition = digest({"season": season, "records": [{key: value for key, value in row.items() if key != "captured_at"} for row in records]})
    return {
        "schema_version": 1,
        "provider": PROVIDER,
        "season": season,
        "edition": edition,
        "captured_at": captured_at,
        "list_url": LIST_URL.format(season=season),
        "list_sha256": hashlib.sha256(listing_body).hexdigest(),
        "records": records,
        "coverage": {"prospects": len(records), "listed_prospects": len(athlete_ids)},
    }


def quote(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_export(release: dict, migration: Path = MIGRATION) -> str:
    lines = [migration.read_text().rstrip(), ""]
    columns = ["edition", "season", "athlete_id", "name", "position", "grade", "rank", "position_rank", "state_rank", "region_rank", "status", "committed_team_id", "committed_team_name", "school_ids_json", "high_school", "hometown", "height_inches", "weight_pounds", "captured_at", "source_url", "source_sha256", "payload_json"]
    for row in release["records"]:
        values = [release["edition"], release["season"], row["athlete_id"], row["name"], row["position"], row["grade"], row["rank"], row["position_rank"], row["state_rank"], row["region_rank"], row["status"], row["committed_team_id"], row["committed_team_name"], compact(row["school_ids"]), row["high_school"], row["hometown"], row["height_inches"], row["weight_pounds"], release["captured_at"], row["source_url"], row["source_sha256"], compact(row)]
        lines.append("INSERT OR IGNORE INTO bb_espn_recruiting (" + ",".join(columns) + ") VALUES (" + ",".join(quote(value) for value in values) + ");")
    lines.append("INSERT INTO bb_espn_recruiting_current (season,edition,captured_at) VALUES (" + ",".join(quote(value) for value in (release["season"], release["edition"], release["captured_at"])) + ") ON CONFLICT(season) DO UPDATE SET edition=excluded.edition,captured_at=excluded.captured_at;")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2027)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--sql", type=Path, default=DEFAULT_SQL)
    args = parser.parse_args()
    try:
        release = fetch_release(args.season, args.workers)
        args.sql.parent.mkdir(parents=True, exist_ok=True)
        args.sql.write_text(sql_export(release))
    except (RuntimeError, ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({"season": release["season"], "edition": release["edition"], **release["coverage"], "sql": str(args.sql)}, indent=2))


if __name__ == "__main__":
    main()
