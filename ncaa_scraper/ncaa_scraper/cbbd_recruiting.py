"""Import authorized CollegeBasketballData recruiting API records.

The API is a licensed, server-side source. This connector never publishes raw
responses: it stores the provider payload in a separate private D1 table and
the public endpoint exposes only counts and capture clocks. The portal endpoint
does not provide an event date, so the importer keeps the season and capture
clock without manufacturing a status date.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import dotenv_values

from .football_sources import ROOT

BASE_URL = "https://api.collegebasketballdata.com"
PROVIDER = "CollegeBasketballData.com API"
LICENSE_URL = "https://collegebasketballdata.com/terms"
MIGRATION = ROOT / "worker/migrations/0026_cbbd_recruiting.sql"
DEFAULT_SQL = ROOT / ".local/cbbd-recruiting.sql"
MAX_RESPONSE_BYTES = 10 * 1024 * 1024


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(compact(value).encode("utf-8")).hexdigest()


def capture_clock(value: datetime | None = None) -> str:
    now = value or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("capture clock requires a timezone")
    return now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def api_key() -> str | None:
    values = dotenv_values(Path.home() / ".env")
    return (
        os.environ.get("CBBD_API_KEY")
        or values.get("CBBD_API_KEY")
        or os.environ.get("COLLEGE_BASKETBALL_DATA_API_KEY")
        or values.get("COLLEGE_BASKETBALL_DATA_API_KEY")
    )


def fetch_json(
    path: str,
    params: dict[str, object],
    token: str,
    *,
    opener=urlopen,
    sleep=time.sleep,
) -> tuple[list[dict], str]:
    """Fetch one bounded API response and return rows plus its exact URL."""
    if not token.strip():
        raise ValueError("CBBD_API_KEY is empty")
    if not path.startswith("/"):
        raise ValueError("API path must start with /")
    url = f"{BASE_URL}{path}?{urlencode(params)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token.strip()}",
            "User-Agent": "SilvermineResearch/1.0 (service@silvermineai.com)",
        },
        method="GET",
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with opener(request, timeout=30) as response:
                status = getattr(response, "status", 200)
                if status == 429 or status >= 500:
                    raise RuntimeError(f"CBBD source busy ({status})")
                if status < 200 or status >= 300:
                    raise RuntimeError(f"CBBD source unavailable ({status})")
                payload = response.read(MAX_RESPONSE_BYTES + 1)
                if len(payload) > MAX_RESPONSE_BYTES:
                    raise RuntimeError("CBBD response exceeds the 10 MB bound")
            decoded = json.loads(payload.decode("utf-8"))
            if not isinstance(decoded, list) or not all(isinstance(row, dict) for row in decoded):
                raise RuntimeError("CBBD response must be a JSON array of objects")
            return decoded, url
        except HTTPError as error:
            if error.code not in (429,) and error.code < 500:
                raise RuntimeError(f"CBBD source unavailable ({error.code}): {url}") from error
            last_error = error
            if attempt == 2:
                break
            sleep(2**attempt)
        except Exception as error:  # pragma: no cover - retry branch is timing-dependent
            last_error = error
            if attempt == 2:
                break
            sleep(2**attempt)
    raise RuntimeError(f"CBBD request failed: {url}") from last_error


def _text(value: object) -> str | None:
    return str(value).strip() if value not in (None, "") else None


def _id(value: object) -> str | None:
    text = _text(value)
    return text if text and len(text) <= 80 else None


def _number(value: object, *, integer: bool = False) -> int | float | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if integer:
        return int(number) if number.is_integer() else None
    return number


def normalize_endpoint(
    kind: str,
    season: int,
    rows: list[dict],
    source_url: str,
    captured_at: str,
) -> list[dict[str, object]]:
    """Normalize API records while retaining the complete provider payload."""
    if kind not in {"portal", "players", "teams"}:
        raise ValueError(f"Unsupported CBBD recruiting endpoint: {kind}")
    source_sha256 = hashlib.sha256(compact(rows).encode("utf-8")).hexdigest()
    normalized: list[dict[str, object]] = []
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        if kind == "portal":
            source_record_id = _id(raw.get("sourceId") or raw.get("id"))
            first = _text(raw.get("firstName")) or ""
            last = _text(raw.get("lastName")) or ""
            player_name = (f"{first} {last}").strip() or _text(raw.get("name"))
            origin = raw.get("origin") if isinstance(raw.get("origin"), dict) else {}
            destination = raw.get("destination") if isinstance(raw.get("destination"), dict) else {}
            values = {
                "from_program": _text(origin.get("name")),
                "from_program_id": _id(origin.get("id")),
                "to_program": _text(destination.get("name")),
                "to_program_id": _id(destination.get("id")),
                "position": _text(raw.get("position")),
                "eligibility": _text(raw.get("eligibility")),
                "years_remaining": _number(raw.get("yearsRemaining"), integer=True),
                "stars": _number(raw.get("stars"), integer=True),
                "rating": _number(raw.get("rating")),
                "ranking": None,
            }
        elif kind == "players":
            source_record_id = _id(raw.get("sourceId") or raw.get("id"))
            committed = raw.get("committedTo") if isinstance(raw.get("committedTo"), dict) else {}
            school = _text(raw.get("school"))
            values = {
                "from_program": None,
                "from_program_id": None,
                "to_program": _text(committed.get("name")) or school,
                "to_program_id": _id(committed.get("id")) or _id(raw.get("schoolId")),
                "position": _text(raw.get("position")),
                "eligibility": None,
                "years_remaining": None,
                "stars": _number(raw.get("stars"), integer=True),
                "rating": _number(raw.get("rating")),
                "ranking": _number(raw.get("ranking"), integer=True),
            }
            player_name = _text(raw.get("name"))
        else:
            source_record_id = _id(raw.get("teamId") or raw.get("id"))
            player_name = None
            values = {
                "from_program": None,
                "from_program_id": None,
                "to_program": _text(raw.get("team")),
                "to_program_id": _id(raw.get("teamId")),
                "position": None,
                "eligibility": None,
                "years_remaining": None,
                "stars": None,
                "rating": _number(raw.get("rating")),
                "ranking": _number(raw.get("ranking"), integer=True),
            }
        source_record_id = source_record_id or f"row-{index}"
        record_id = f"cbbd-{season}-{kind}-{source_record_id}"
        if record_id in seen:
            raise ValueError(f"Duplicate CBBD record identity: {record_id}")
        seen.add(record_id)
        if kind != "teams" and not player_name:
            raise ValueError(f"CBBD {kind} row {index} has no player name")
        if kind == "teams" and not values["to_program"]:
            raise ValueError(f"CBBD team row {index} has no team name")
        normalized.append(
            {
                "record_id": record_id,
                "season": season,
                "kind": kind,
                "source_record_id": source_record_id,
                "player_name": player_name,
                **values,
                "captured_at": captured_at,
                "source_url": source_url,
                "provider": PROVIDER,
                "license_url": LICENSE_URL,
                "source_sha256": source_sha256,
                "payload_json": compact(raw),
            }
        )
    return normalized


def quote(value: object) -> str:
    if value is None or value == "":
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def sql_export(rows: list[dict[str, object]], migration: Path = MIGRATION) -> str:
    columns = [
        "record_id", "season", "kind", "source_record_id", "player_name",
        "from_program", "from_program_id", "to_program", "to_program_id",
        "position", "eligibility", "years_remaining", "stars", "rating", "ranking",
        "captured_at", "source_url", "provider", "license_url", "source_sha256", "payload_json",
    ]
    lines = [migration.read_text().rstrip(), ""]
    for row in rows:
        lines.append(
            "INSERT OR IGNORE INTO bb_cbbd_recruiting (" + ",".join(columns) + ") VALUES (" +
            ",".join(quote(row[column]) for column in columns) + ");"
        )
    return "\n".join(lines) + "\n"


def fetch_release(seasons: list[int], token: str | None = None, *, sleep=time.sleep) -> list[dict[str, object]]:
    token = token or api_key()
    if not token:
        raise RuntimeError("No CBBD_API_KEY configured. Add it to ~/.env; no provider call was made.")
    all_rows: list[dict[str, object]] = []
    for season in seasons:
        if not 2025 <= season <= 2035:
            raise ValueError("CBBD recruiting seasons must be between 2025 and 2035")
        for kind, path in (("portal", "/recruiting/portal"), ("players", "/recruiting/players"), ("teams", "/recruiting/teams")):
            rows, url = fetch_json(path, {"year": season}, token)
            captured = capture_clock()
            all_rows.extend(normalize_endpoint(kind, season, rows, url, captured))
            sleep(1.0)
    return all_rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, action="append", dest="seasons", default=None)
    parser.add_argument("--sql", type=Path, default=DEFAULT_SQL)
    args = parser.parse_args()
    rows = fetch_release(args.seasons or [2027])
    args.sql.parent.mkdir(parents=True, exist_ok=True)
    args.sql.write_text(sql_export(rows))
    print(json.dumps({"rows": len(rows), "seasons": args.seasons or [2027], "sql": str(args.sql)}))


if __name__ == "__main__":
    main()
