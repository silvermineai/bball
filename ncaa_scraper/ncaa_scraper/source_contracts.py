"""Fail-closed discovery checks for lower-division player releases.

The NCAA pages used by :mod:`ncaa_scraper.ingest` are useful for contest
records, but they are not a contract for a complete D2/D3 player archive.
This module describes the attributed bulk releases that can be used for that
archive and reports the exact fields still required before an import is safe.

The checks deliberately do not classify a row from a school name, conference,
``non-D1`` flag, or a missing division.  A lower-division import becomes
ready only when the publisher supplies an explicit division and stable player
and team identity fields, backed by an immutable release receipt.
"""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Mapping

from .football_sources import DATASETS as FOOTBALL_DATASETS, RELEASES
from .womens_basketball_sources import DATASETS as WBB_DATASETS


REQUIRED_SCOPE_FIELDS = ("sport", "gender", "division", "season")
REQUIRED_IDENTITY_FIELDS = (
    "team_id",
    "team_display_name",
    "athlete_id",
    "athlete_display_name",
)
REQUIRED_RECEIPT_FIELDS = ("url", "sha256")


def _release_url(tag: str, asset_template: str) -> str:
    return f"{RELEASES}/{tag}/{asset_template}"


# These are source-native contracts, rather than guessed schemas.  The WBB
# field observations come from the retained parquet schema audit.  Football
# observations come from the cfbfastR/NCAA release schemas and are checked
# against the local CSV headers when a release is retained.
_CATALOG: dict[str, dict[str, Any]] = {
    "WBB": {
        "sport": "basketball",
        "gender": "women",
        "label": "women's basketball",
        "datasets": WBB_DATASETS,
        "candidates": (
            {
                "dataset": "player_season",
                "required_identity": REQUIRED_IDENTITY_FIELDS,
                "known_missing_scope": ("division",),
                "notes": (
                    "The retained player-season parquet has stable athlete/team fields but no explicit division field.",
                ),
            },
            {
                "dataset": "player_box",
                "required_identity": REQUIRED_IDENTITY_FIELDS,
                "known_missing_scope": ("division",),
                "notes": (
                    "The retained player-box parquet has stable athlete/team fields but no explicit division field.",
                ),
            },
        ),
    },
    "MFB": {
        "sport": "football",
        "gender": "men",
        "label": "football",
        "datasets": FOOTBALL_DATASETS,
        "candidates": (
            {
                "dataset": "passing",
                "required_identity": ("team_id", "player_id", "passer_player_name"),
                "known_missing_scope": (),
                "observed_scope": ("division",),
                "notes": (
                    "The retained cfbfastR passing release currently labels rows as fbs; no D2/D3 rows are present.",
                ),
            },
            {
                "dataset": "rushing",
                "required_identity": ("team_id", "player_id", "rusher_player_name"),
                "known_missing_scope": (),
                "observed_scope": ("division",),
                "notes": (
                    "The retained cfbfastR rushing release currently labels rows as fbs; no D2/D3 rows are present.",
                ),
            },
            {
                "dataset": "receiving",
                "required_identity": ("team_id", "player_id", "receiver_player_name"),
                "known_missing_scope": (),
                "observed_scope": ("division",),
                "notes": (
                    "The retained cfbfastR receiving release currently labels rows as fbs; no D2/D3 rows are present.",
                ),
            },
            {
                "dataset": "box",
                "required_identity": ("team_id", "athlete_id", "athlete_name"),
                "known_missing_scope": ("division",),
                "notes": (
                    "The retained player-box release has a stable athlete ID but no explicit division field.",
                ),
            },
            {
                "dataset": "ncaa_player_stats",
                "required_identity": ("team_id", "name"),
                "known_missing_scope": ("division", "athlete_id"),
                "notes": (
                    "The NCAA-derived game release has names and team/contest IDs, but no stable athlete ID or division field.",
                ),
            },
        ),
    },
}


def _valid_receipt(receipt: Mapping[str, Any] | None) -> bool:
    if not receipt:
        return False
    url = str(receipt.get("url") or "").strip()
    digest = str(receipt.get("sha256") or "").strip().lower()
    return bool(url) and len(digest) == 64 and all(char in "0123456789abcdef" for char in digest)


def validate_player_source_rows(
    rows: Iterable[Mapping[str, Any]],
    receipt: Mapping[str, Any] | None,
    *,
    sport: str,
    gender: str,
    division: str | int,
) -> dict[str, Any]:
    """Validate a labeled lower-division player release without reclassifying rows."""

    expected_division = str(division)
    errors: list[dict[str, Any]] = []
    if expected_division not in {"2", "3"}:
        errors.append({"code": "unsupported_target_division", "message": "Only D2 and D3 imports use this lower-division contract."})
    if not _valid_receipt(receipt):
        errors.append({"code": "invalid_receipt", "message": "A source URL and 64-character SHA-256 receipt are required before import."})

    for index, row in enumerate(rows):
        if str(row.get("sport") or "").strip().lower() != sport.lower():
            errors.append({"row": index, "code": "wrong_sport", "message": f"Rows must carry sport={sport}."})
        if str(row.get("gender") or "").strip().lower() != gender.lower():
            errors.append({"row": index, "code": "wrong_gender", "message": f"Rows must carry gender={gender}."})
        if str(row.get("division") or "").strip() != expected_division:
            errors.append({"row": index, "code": "missing_or_invalid_division", "message": f"Rows must carry explicit division={expected_division}."})
        for field in ("season", *REQUIRED_IDENTITY_FIELDS):
            if row.get(field) in (None, ""):
                errors.append({"row": index, "code": f"missing_{field}", "message": f"Rows must carry {field}."})

    return {
        "accepted": not errors,
        "status": "ready" if not errors else "blocked",
        "required_scope_fields": list(REQUIRED_SCOPE_FIELDS),
        "required_identity_fields": list(REQUIRED_IDENTITY_FIELDS),
        "required_receipt_fields": list(REQUIRED_RECEIPT_FIELDS),
        "errors": errors,
    }


def _cached_observation(dataset: str, year: int | None) -> dict[str, Any] | None:
    """Read only local football release evidence; never downloads or infers scope."""

    if year is None or dataset not in FOOTBALL_DATASETS:
        return None
    _, template = FOOTBALL_DATASETS[dataset]
    name = template.format(year=year)
    path = Path(__file__).resolve().parents[2] / ".local" / "football" / name
    if not path.exists() or path.suffix == ".parquet":
        return None
    try:
        if path.name.endswith(".gz"):
            import gzip

            handle_context = gzip.open(path, "rt", encoding="utf-8-sig", newline="")
        else:
            handle_context = path.open("rt", encoding="utf-8-sig", newline="")
        with handle_context as handle:
            reader = csv.DictReader(handle)
            fields = list(reader.fieldnames or [])
            values: set[str] = set()
            rows = 0
            for row in reader:
                rows += 1
                if row.get("division") not in (None, ""):
                    values.add(str(row["division"]))
        receipt_path = Path(str(path) + ".receipt.json")
        receipt: dict[str, Any] = {}
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return {
            "season": year,
            "asset": str(path),
            "rows": rows,
            "fields": fields,
            "observed_divisions": sorted(values),
            "receipt_valid": _valid_receipt(receipt) and receipt.get("sha256") == digest,
        }
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
        return {"season": year, "asset": str(path), "status": "unreadable"}


def discover_lower_division_sources(
    sport_code: str,
    division: str | int,
    *,
    season: int | None = None,
) -> dict[str, Any]:
    """Return actionable source-contract diagnostics for a requested D2/D3 scope."""

    code = sport_code.upper()
    if code not in _CATALOG:
        raise ValueError(f"No lower-division player source catalog is defined for {sport_code}.")
    target = str(division)
    if target not in {"2", "3"}:
        raise ValueError("Lower-division player discovery supports division 2 or 3 only.")
    catalog = _CATALOG[code]
    candidates: list[dict[str, Any]] = []
    for spec in catalog["candidates"]:
        dataset = spec["dataset"]
        tag, template = catalog["datasets"][dataset]
        blockers = []
        if spec.get("known_missing_scope"):
            for field in spec["known_missing_scope"]:
                blockers.append({"code": f"missing_{field}", "message": f"Release contract does not provide explicit {field} for this player asset."})
        observation = _cached_observation(dataset, season)
        if observation and "division" in observation.get("fields", []):
            if target not in observation.get("observed_divisions", []):
                blockers.append({"code": "target_division_absent", "message": f"Retained {season} asset contains no division={target} rows; observed divisions: {observation.get('observed_divisions', [])}."})
        candidates.append(
            {
                "dataset": dataset,
                "release_asset": template,
                "source_url_template": _release_url(tag, template),
                "required_identity_fields": list(spec["required_identity"]),
                "known_missing_scope_fields": list(spec.get("known_missing_scope", ())),
                "notes": list(spec.get("notes", ())),
                "observation": observation,
                "status": "blocked" if blockers else "requires_labeled_release_validation",
                "blockers": blockers,
            }
        )

    has_blockers = any(candidate["blockers"] for candidate in candidates)
    return {
        "schema_version": 1,
        "status": "blocked" if has_blockers else "needs_labeled_release_validation",
        "requested_scope": {"sport_code": code, "sport": catalog["sport"], "gender": catalog["gender"], "division": target, "season": season},
        "catalog": "SportsDataverse release assets; no direct scraping",
        "required_scope_fields": list(REQUIRED_SCOPE_FIELDS),
        "required_identity_fields": list(REQUIRED_IDENTITY_FIELDS),
        "required_receipt_fields": list(REQUIRED_RECEIPT_FIELDS),
        "candidates": candidates,
        "next_inputs": [
            f"A {catalog['label']} release with every row explicitly labeled sport={catalog['sport']}, gender={catalog['gender']}, division={target}, and season.",
            "Stable athlete_id, athlete_display_name, team_id, and team_display_name fields for every player row.",
            "The publisher URL and a SHA-256 receipt for the exact downloaded bytes.",
        ],
        "classification_policy": "Missing division, school names, conference names, and non-D1 flags never classify a row as D2 or D3.",
    }
