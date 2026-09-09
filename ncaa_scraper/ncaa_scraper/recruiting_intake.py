"""Validate an authorized recruiting/transfer evidence export.

This importer is deliberately not a web scraper. It accepts a provider export
only when the operator supplies its license, source URL and capture clocks.
Rows remain source-reported evidence in a separate table; they do not become
the curated school-announcement release, roster status or an eligibility
determination.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from .football_sources import ROOT, utcnow

REQUIRED = {
    "season",
    "player_name",
    "from_program",
    "to_program",
    "status",
    "status_date",
    "source_published_on",
    "source_url",
    "source_publisher",
    "captured_at",
}
STATUSES = {
    "reported_transfer",
    "reported_commitment",
    "reported_withdrawal",
    "reported_eligibility",
    "reported_unavailability",
    "reported_update",
}
MIGRATION = ROOT / "worker/migrations/0025_basketball_recruiting_intake.sql"
DEFAULT_SQL = ROOT / ".local/recruiting-intake.sql"


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(compact(value).encode("utf-8")).hexdigest()


def quote(value: object) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamps must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_url(value: str, label: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError(f"{label} must be an https URL without credentials")
    return value.strip()


def normalize_row(raw: dict[str, str], row_number: int, *, provider: str, license_url: str, source_sha256: str, now: datetime) -> dict[str, object]:
    def required(name: str) -> str:
        value = (raw.get(name) or "").strip()
        if not value:
            raise ValueError(f"row {row_number}: {name} is required")
        return value

    season_raw = required("season")
    if not season_raw.isdigit() or not 2025 <= int(season_raw) <= 2035:
        raise ValueError(f"row {row_number}: season must be between 2025 and 2035")
    status = required("status").lower()
    if status not in STATUSES:
        raise ValueError(f"row {row_number}: unsupported status {status!r}")
    player = required("player_name")
    to_program = required("to_program")
    from_program = (raw.get("from_program") or "").strip()
    if status in {"reported_transfer", "reported_commitment"} and not from_program:
        raise ValueError(f"row {row_number}: from_program is required for {status}")
    status_day = date.fromisoformat(required("status_date"))
    published_day = date.fromisoformat(required("source_published_on"))
    captured = timestamp(required("captured_at"))
    captured_dt = datetime.fromisoformat(captured.replace("Z", "+00:00"))
    if published_day > captured_dt.date() or status_day > captured_dt.date():
        raise ValueError(f"row {row_number}: source/status dates cannot be after captured_at")
    if captured_dt > now:
        raise ValueError(f"row {row_number}: captured_at cannot be in the future")
    source_url = validate_url(required("source_url"), "source_url")
    source_publisher = required("source_publisher")
    payload = {
        **{key: (value or "").strip() for key, value in raw.items()},
        "provider": provider,
        "license_url": license_url,
        "source_sha256": source_sha256,
    }
    record_id = (raw.get("record_id") or "").strip() or digest([source_sha256, row_number, payload])
    if len(record_id) > 160:
        raise ValueError(f"row {row_number}: record_id is too long")
    return {
        "record_id": record_id,
        "season": int(season_raw),
        "player_name": player,
        "player_source_id": (raw.get("player_source_id") or "").strip() or None,
        "from_program": from_program or None,
        "from_program_id": (raw.get("from_program_id") or "").strip() or None,
        "to_program": to_program,
        "to_program_id": (raw.get("to_program_id") or "").strip() or None,
        "status": status,
        "status_date": status_day.isoformat(),
        "source_published_on": published_day.isoformat(),
        "source_url": source_url,
        "source_publisher": source_publisher,
        "captured_at": captured,
        "provider": provider,
        "license_url": license_url,
        "source_sha256": source_sha256,
        "payload_json": compact(payload),
    }


def read_csv(path: Path, *, provider: str, license_url: str, now: datetime | None = None) -> tuple[list[dict[str, object]], str]:
    raw_bytes = path.read_bytes()
    source_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or [])
        missing = REQUIRED - fields
        if missing:
            raise ValueError("CSV is missing required columns: " + ", ".join(sorted(missing)))
        rows = list(reader)
    if not rows:
        raise ValueError("CSV contains no rows")
    provider = provider.strip()
    if not provider:
        raise ValueError("provider is required")
    license_url = validate_url(license_url, "license_url")
    checked_at = now or datetime.now(timezone.utc)
    normalized = [normalize_row(row, index, provider=provider, license_url=license_url, source_sha256=source_sha256, now=checked_at) for index, row in enumerate(rows, start=2)]
    ids = [str(row["record_id"]) for row in normalized]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate record_id values in export")
    return normalized, source_sha256


def sql_export(rows: list[dict[str, object]], migration: Path = MIGRATION) -> str:
    columns = [
        "record_id", "season", "player_name", "player_source_id", "from_program", "from_program_id",
        "to_program", "to_program_id", "status", "status_date", "source_published_on", "source_url",
        "source_publisher", "captured_at", "provider", "license_url", "source_sha256", "payload_json",
    ]
    lines = [migration.read_text().rstrip(), ""]
    for row in rows:
        lines.append(
            "INSERT OR IGNORE INTO bb_recruiting_intake (" + ",".join(columns) + ") VALUES (" +
            ",".join(quote(row[column]) for column in columns) + ");"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="Authorized provider recruiting/transfer CSV export")
    parser.add_argument("--provider", required=True, help="Provider identity")
    parser.add_argument("--license-url", required=True, help="Terms/license URL governing the export")
    parser.add_argument("--sql", type=Path, default=DEFAULT_SQL)
    args = parser.parse_args()
    rows, source_sha256 = read_csv(args.file, provider=args.provider, license_url=args.license_url)
    args.sql.parent.mkdir(parents=True, exist_ok=True)
    args.sql.write_text(sql_export(rows))
    print(json.dumps({"rows": len(rows), "source_sha256": source_sha256, "sql": str(args.sql)}))


if __name__ == "__main__":
    main()
