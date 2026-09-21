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

# Keep source scope evidence next to the catalog instead of burying it in a
# UI note.  The release pages are public, versioned contracts; their stated
# capture scope is stronger evidence than a school-name or conference guess.
# In particular, the NCAA football release is built from FBS and FCS capture
# stages.  It must not be presented as a D2/D3 player archive merely because
# the companion ESPN team release contains lower-division team rows.
FOOTBALL_SOURCE_EVIDENCE = {
    "ncaa_player_stats": {
        "publisher": "SportsDataverse",
        "upstream": "stats.ncaa.org official box scores and play-by-play",
        "license": "CC BY 4.0 (publisher release)",
        "release_page": "https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/ncaa_mfb_player_stats",
        "scope_claim": ["fbs", "fcs"],
        "scope_basis": "publisher release notes name raw.capture_fbs and raw.capture_fcs; no D2/D3 capture stage is listed",
        "identity_note": "The release has source names and team/contest IDs, but no stable athlete ID.",
    },
    "box": {
        "publisher": "SportsDataverse",
        "upstream": "ESPN college-football API",
        "license": "CC BY 4.0 (publisher release)",
        "release_page": "https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_cfb_player_box",
        "scope_claim": ["unscoped player rows"],
        "scope_basis": "player-box rows do not carry a division; the companion team release is only a mapping observation and cannot create missing player coverage",
        "identity_note": "The player-box release carries stable athlete and team IDs, but division must be observed from the exact team release and every target row must be present.",
    },
    "passing": {
        "publisher": "SportsDataverse",
        "upstream": "ESPN college-football API",
        "license": "CC BY 4.0 (publisher release)",
        "release_page": "https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_cfb_passing",
        "scope_claim": ["fbs"],
        "scope_basis": "retained rows carry division=fbs; no D2/D3 rows are present",
    },
    "rushing": {
        "publisher": "SportsDataverse",
        "upstream": "ESPN college-football API",
        "license": "CC BY 4.0 (publisher release)",
        "release_page": "https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_cfb_rushing",
        "scope_claim": ["fbs"],
        "scope_basis": "retained rows carry division=fbs; no D2/D3 rows are present",
    },
    "receiving": {
        "publisher": "SportsDataverse",
        "upstream": "ESPN college-football API",
        "license": "CC BY 4.0 (publisher release)",
        "release_page": "https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_cfb_receiving",
        "scope_claim": ["fbs"],
        "scope_basis": "retained rows carry division=fbs; no D2/D3 rows are present",
    },
}

# Public endpoint contracts that can be evaluated before a player import is
# attempted.  The ESPN group-35 feed is a useful discovery surface for
# Division II/III events, but it combines those divisions and therefore cannot
# classify a player row on its own.  The NCAA national-ranking page accepts an
# explicit football division, but no capture is retained in this repository;
# the robots policy, response schema, row identities, and immutable receipt
# must be verified for the exact season before publication.
FOOTBALL_PUBLIC_PLAYER_ENDPOINTS = (
    {
        "key": "ncaa_mfb_national_ranking",
        "publisher": "NCAA Statistics",
        "url_template": (
            "https://stats.ncaa.org/rankings/national_ranking"
            "?academic_year={season}&division={division}&sport_code=MFB"
        ),
        "method": "GET",
        "scope": "exact requested football division",
        "discovery_status": "candidate_unverified",
        "expected_fields": [
            "season",
            "division",
            "player_id",
            "name",
            "team_id",
            "team_name",
            "stat_value",
        ],
        "required_before_import": [
            "robots-permitted capture",
            "explicit division=2 or division=3 on every row",
            "stable player and team identity fields",
            "response URL and SHA-256 receipt",
        ],
        "reason": (
            "The query carries an explicit division parameter, but no exact-"
            "season football response is retained and the response schema has "
            "not passed the import contract."
        ),
    },
    {
        "key": "espn_mfb_group_35_event_summary",
        "publisher": "ESPN",
        "url_template": (
            "https://site.api.espn.com/apis/site/v2/sports/football/"
            "college-football/summary?event={event_id}"
        ),
        "discovery_url_template": (
            "https://site.api.espn.com/apis/site/v2/sports/football/"
            "college-football/scoreboard?dates={yyyymmdd}&groups=35"
        ),
        "method": "GET",
        "scope": "combined D2/D3 event discovery and game box score",
        "discovery_status": "candidate_unverified",
        "expected_fields": [
            "event_id",
            "team_id",
            "athlete_id",
            "athlete_name",
            "stat_name",
            "stat_value",
        ],
        "required_before_import": [
            "robots-permitted capture of the group-35 schedule",
            "exact D2/D3 team classification from a source-labeled team release",
            "stable athlete and team IDs on every box-score row",
            "per-response URL and SHA-256 receipt",
        ],
        "reason": (
            "ESPN group 35 discovers Division II/III games but combines both "
            "divisions; event summaries must be joined to an explicit, exact-"
            "division team release before any player rows can be published."
        ),
    },
)


def _release_url(tag: str, asset_template: str) -> str:
    return f"{RELEASES}/{tag}/{asset_template}"


# These are source-native contracts, rather than guessed schemas.  The WBB
# field observations come from the retained parquet schema audit.  Football
# observations come from the cfbfastR/NCAA release schemas and are checked
# against the local CSV headers when a release is retained.
_CATALOG: dict[str, dict[str, Any]] = {
    "MBB": {
        "sport": "basketball",
        "gender": "men",
        "label": "men's basketball",
        # This is a normalized derivative of the NCAA national-ranking pages,
        # not a bulk SportsDataverse asset. Keep it in its own source contract
        # so an explicit NCAA division cannot be mistaken for a guessed
        # non-D1 classification.
        "datasets": {
            "ncaa_individual": ("ncaa_statistics", "ncaa-individual-{season}.json"),
        },
        "candidates": (
            {
                "dataset": "ncaa_individual",
                "required_identity": ("player_id", "name", "team_name"),
                "observed_scope": ("division",),
                "notes": (
                    "NCAA national-ranking rows carry an explicit division and stable NCAA player/team IDs.",
                    "Only rows retained from the exact-season NCAA release are eligible for D2/D3 coverage.",
                ),
            },
        ),
    },
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


def _cached_team_scope(year: int | None) -> tuple[dict[str, Any] | None, dict[str, str]]:
    """Read the exact-season team scope used only as a join observation.

    ESPN's team reference release labels D2/D3 teams, while its player-box
    release does not.  Returning the mapping separately lets diagnostics show
    whether player rows actually join to those teams without treating the
    existence of a team as proof that player production was published.
    """

    if year is None:
        return None, {}
    root = Path(__file__).resolve().parents[2]
    path = root / ".local" / "football" / f"cfb_teams_{year}.csv"
    if not path.exists():
        return None, {}
    try:
        with path.open("rt", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        receipt_path = Path(str(path) + ".receipt.json")
        receipt: dict[str, Any] = {}
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        mapping = {
            str(row.get("team_id")): str(row.get("division"))
            for row in rows
            if row.get("team_id") and row.get("division")
        }
        counts: dict[str, int] = {}
        for division in mapping.values():
            counts[division] = counts.get(division, 0) + 1
        return (
            {
                "asset": str(path),
                "rows": len(rows),
                "observed_divisions": sorted(counts),
                "team_rows_by_division": counts,
                "receipt_valid": _valid_receipt(receipt) and receipt.get("sha256") == digest,
            },
            mapping,
        )
    except (OSError, UnicodeError, TypeError, ValueError, json.JSONDecodeError):
        return {"asset": str(path), "status": "unreadable"}, {}


def validate_player_source_rows(
    rows: Iterable[Mapping[str, Any]],
    receipt: Mapping[str, Any] | None,
    *,
    sport: str,
    gender: str,
    division: str | int,
) -> dict[str, Any]:
    """Validate a labeled lower-division player release without reclassifying rows.

    The identity key includes an optional event/contest ID and stat label so a
    source can publish one player across multiple games or categories while a
    conflicting repeat of the same identity/stat row is rejected.
    """

    expected_division = str(division)
    errors: list[dict[str, Any]] = []
    if expected_division not in {"2", "3"}:
        errors.append({"code": "unsupported_target_division", "message": "Only D2 and D3 imports use this lower-division contract."})
    if not _valid_receipt(receipt):
        errors.append({"code": "invalid_receipt", "message": "A source URL and 64-character SHA-256 receipt are required before import."})

    seen: dict[tuple[str, ...], str] = {}
    row_count = 0
    for index, row in enumerate(rows):
        row_count += 1
        if not isinstance(row, Mapping):
            errors.append({"row": index, "code": "malformed_row", "message": "Each release row must be a mapping."})
            continue
        if str(row.get("sport") or "").strip().lower() != sport.lower():
            errors.append({"row": index, "code": "wrong_sport", "message": f"Rows must carry sport={sport}."})
        if str(row.get("gender") or "").strip().lower() != gender.lower():
            errors.append({"row": index, "code": "wrong_gender", "message": f"Rows must carry gender={gender}."})
        if str(row.get("division") or "").strip() != expected_division:
            errors.append({"row": index, "code": "missing_or_invalid_division", "message": f"Rows must carry explicit division={expected_division}."})
        for field in ("season", *REQUIRED_IDENTITY_FIELDS):
            if row.get(field) in (None, ""):
                errors.append({"row": index, "code": f"missing_{field}", "message": f"Rows must carry {field}."})

        identity = (
            str(row.get("season") or ""),
            str(row.get("division") or ""),
            str(row.get("team_id") or ""),
            str(row.get("athlete_id") or ""),
            str(row.get("event_id") or row.get("game_id") or row.get("contest_id") or ""),
            str(row.get("stat_name") or row.get("stat_label") or row.get("category") or row.get("metric") or ""),
        )
        payload = json.dumps(dict(row), sort_keys=True, ensure_ascii=False, default=str)
        prior = seen.get(identity)
        if prior is None:
            seen[identity] = payload
        elif prior != payload:
            errors.append({"row": index, "code": "conflicting_duplicate", "message": "Conflicting duplicate identity/stat rows are rejected."})

    return {
        "accepted": not errors,
        "status": "ready" if not errors else "blocked",
        "rows": row_count,
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
        team_scope, team_divisions = _cached_team_scope(year) if dataset == "box" else (None, {})
        mapped_rows: dict[str, int] = {}
        mapped_athletes: dict[str, set[str]] = {}
        with handle_context as handle:
            reader = csv.DictReader(handle)
            fields = list(reader.fieldnames or [])
            values: set[str] = set()
            rows = 0
            for row in reader:
                rows += 1
                if row.get("division") not in (None, ""):
                    values.add(str(row["division"]))
                mapped_division = team_divisions.get(str(row.get("team_id") or ""))
                if mapped_division:
                    mapped_rows[mapped_division] = mapped_rows.get(mapped_division, 0) + 1
                    athlete_id = str(row.get("athlete_id") or "").strip()
                    if athlete_id:
                        mapped_athletes.setdefault(mapped_division, set()).add(athlete_id)
        receipt_path = Path(str(path) + ".receipt.json")
        receipt: dict[str, Any] = {}
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        observation = {
            "season": year,
            "asset": str(path),
            "rows": rows,
            "fields": fields,
            "observed_divisions": sorted(values),
            "receipt_valid": _valid_receipt(receipt) and receipt.get("sha256") == digest,
        }
        if team_scope is not None:
            observation["team_scope"] = team_scope
            observation["team_scope"]["player_rows_by_division"] = mapped_rows
            observation["team_scope"]["player_athletes_by_division"] = {
                division: len(athletes)
                for division, athletes in mapped_athletes.items()
            }
        return observation
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
        return {"season": year, "asset": str(path), "status": "unreadable"}


def _cached_mbb_observation(year: int | None) -> dict[str, Any] | None:
    """Read the retained NCAA MBB derivative without fetching or reclassifying.

    The public derivative has one root season and explicit per-row divisions.
    A matching SHA-256 receipt is required before the observation can satisfy
    a lower-division source contract.  The row-level identity counters make a
    sparse or malformed release fail closed instead of looking like coverage.
    """

    if year is None:
        return None
    root = Path(__file__).resolve().parents[2]
    path = root / "frontend" / "public" / "data" / "basketball" / "ncaa-individual.json"
    receipt_path = root / ".local" / "basketball" / f"ncaa-individual-{year}.json.receipt.json"
    if not path.exists() or not receipt_path.exists():
        return None
    try:
        release = json.loads(path.read_text(encoding="utf-8"))
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        rows = release.get("players") if isinstance(release, dict) else None
        if not isinstance(rows, list):
            return {"season": year, "asset": str(path), "status": "invalid_rows"}
        divisions: dict[str, int] = {}
        identity_complete: dict[str, int] = {}
        field_values: set[str] = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            field_values.update(str(key) for key in row)
            division = str(row.get("division") or "")
            if division:
                divisions[division] = divisions.get(division, 0) + 1
                if all(row.get(field) not in (None, "") for field in ("player_id", "name", "team_name")):
                    identity_complete[division] = identity_complete.get(division, 0) + 1
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return {
            "season": year,
            "release_season": release.get("season") if isinstance(release, dict) else None,
            "asset": str(path),
            "rows": len(rows),
            "fields": sorted(field_values),
            "observed_divisions": sorted(divisions),
            "division_rows": divisions,
            "identity_complete": identity_complete,
            "receipt_valid": _valid_receipt(receipt) and receipt.get("sha256") == digest,
            "receipt": receipt,
        }
    except (OSError, UnicodeError, TypeError, ValueError, json.JSONDecodeError):
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
        observation = _cached_mbb_observation(season) if code == "MBB" else _cached_observation(dataset, season)
        if code == "MBB":
            if not observation:
                blockers.append({"code": "missing_retained_release", "message": "No retained NCAA individual release and receipt are available for this season."})
            elif observation.get("status"):
                blockers.append({"code": "unreadable_retained_release", "message": f"The retained NCAA individual release is {observation['status']}."})
            elif observation.get("release_season") != season:
                blockers.append({"code": "wrong_release_season", "message": f"The retained NCAA release is season={observation.get('release_season')}, not season={season}."})
            elif not observation.get("receipt_valid"):
                blockers.append({"code": "invalid_receipt", "message": "The retained NCAA release bytes do not match its SHA-256 receipt."})
            elif target not in observation.get("observed_divisions", []):
                blockers.append({"code": "target_division_absent", "message": f"Retained NCAA release contains no division={target} rows."})
            elif observation.get("identity_complete", {}).get(target, 0) != observation.get("division_rows", {}).get(target, 0):
                blockers.append({"code": "incomplete_player_identity", "message": f"Every NCAA division={target} row must carry player_id, name, and team_name."})
        if code != "MBB" and observation and "division" in observation.get("fields", []):
            if target not in observation.get("observed_divisions", []):
                blockers.append({"code": "target_division_absent", "message": f"Retained {season} asset contains no division={target} rows; observed divisions: {observation.get('observed_divisions', [])}."})
        source_evidence = FOOTBALL_SOURCE_EVIDENCE.get(dataset) if code == "MFB" else None
        if source_evidence:
            claimed_scope = source_evidence.get("scope_claim", [])
            if target not in claimed_scope and "unscoped player rows" not in claimed_scope:
                blockers.append(
                    {
                        "code": "publisher_scope_excludes_target_division",
                        "message": (
                            f"The retained release documents scope={','.join(claimed_scope)}; "
                            f"it does not publish a player contract for division={target}."
                        ),
                    }
                )
            if dataset == "box" and observation:
                team_scope = observation.get("team_scope") or {}
                mapped = team_scope.get("player_rows_by_division", {})
                if target not in mapped:
                    blockers.append(
                        {
                            "code": "target_division_player_rows_absent",
                            "message": (
                                f"The exact-season player-box rows map to no division={target} teams "
                                f"in the retained team release; mapped rows by division={mapped}."
                            ),
                        }
                    )
        candidate_status = (
            "ready"
            if code == "MBB" and observation and not blockers
            else "blocked" if blockers else "requires_labeled_release_validation"
        )
        candidates.append(
            {
                "dataset": dataset,
                "release_asset": template,
                "source_url_template": (
                    "https://stats.ncaa.org/rankings/national_ranking"
                    if code == "MBB"
                    else _release_url(tag, template)
                ),
                "required_identity_fields": list(spec["required_identity"]),
                "known_missing_scope_fields": list(spec.get("known_missing_scope", ())),
                "notes": list(spec.get("notes", ())),
                "source_evidence": source_evidence,
                "observation": observation,
                "status": candidate_status,
                "blockers": blockers,
            }
        )

    has_blockers = any(candidate["blockers"] for candidate in candidates)
    all_ready = bool(candidates) and all(candidate["status"] == "ready" for candidate in candidates)
    return {
        "schema_version": 1,
        "status": "blocked" if has_blockers else "ready" if all_ready else "needs_labeled_release_validation",
        "requested_scope": {"sport_code": code, "sport": catalog["sport"], "gender": catalog["gender"], "division": target, "season": season},
        "catalog": (
            "NCAA Statistics national-ranking derivative; no direct scraping"
            if code == "MBB"
            else "SportsDataverse release assets; no direct scraping"
        ),
        "public_endpoint_contracts": (
            [
                {
                    **contract,
                    "url": contract["url_template"].format(
                        season=season if season is not None else "{season}",
                        division=target,
                        event_id="{event_id}",
                        yyyymmdd="{yyyymmdd}",
                    ),
                    **(
                        {
                            "discovery_url": contract["discovery_url_template"].format(
                                yyyymmdd="{yyyymmdd}"
                            )
                        }
                        if contract.get("discovery_url_template")
                        else {}
                    ),
                }
                for contract in FOOTBALL_PUBLIC_PLAYER_ENDPOINTS
            ]
            if code == "MFB"
            else []
        ),
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
