"""Build a fail-closed readiness contract for women's basketball divisions.

The retained women’s bulk release is source-native but does not publish a
Division II/III label or complete non-Division-I player/team tables.  This
artifact records that fact, along with the small number of scheduled games
flagged by the source as non-Division-I, so the UI can show useful evidence
without presenting those games as D2 or D3 rows.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EDITION = ROOT / "frontend/public/data/basketball/womens-edition.json"
SCHEDULE = ROOT / ".local/womens-basketball/wbb_schedule_2027.parquet"
OUT = ROOT / "frontend/public/data/basketball/womens-division-readiness.json"

# These are the only fields that can establish a lower-division scope.  A
# source flag such as ``away_non_div1_team`` is deliberately excluded: it
# tells us only that a row is outside Division I.
DIVISION_FIELDS = (
    "division",
    "division_id",
    "division_name",
    "division_code",
    "classification",
    "classification_id",
    "classification_name",
    "level",
    "level_id",
    "level_name",
)
IDENTITY_FIELDS = (
    "game_id",
    "contest_id",
    "team_id",
    "team_display_name",
    "athlete_id",
    "athlete_display_name",
    "player_id",
    "player_name",
)


def _receipt_is_valid(receipt: dict[str, Any] | None) -> bool:
    """Require the immutable receipt fields before a release can be used."""
    if not isinstance(receipt, dict):
        return False
    digest = receipt.get("sha256")
    return bool(
        isinstance(digest, str)
        and re.fullmatch(r"[0-9a-fA-F]{64}", digest)
        and isinstance(receipt.get("url"), str)
        and bool(receipt["url"].strip())
    )


def validate_labeled_release(
    records: list[dict[str, Any]],
    receipt: dict[str, Any] | None,
) -> dict[str, Any]:
    """Validate the minimum release shape needed to publish women’s D2/D3.

    This is intentionally a next-input contract, rather than a classifier.
    It accepts only explicit ``division`` values of 2 or 3 and rejects
    missing identities, missing scope fields, invalid receipts, and
    conflicting duplicate identity/stat rows.  Callers can inspect all
    errors before choosing to publish anything.
    """
    errors: list[dict[str, Any]] = []
    if not _receipt_is_valid(receipt):
        errors.append({"code": "invalid_receipt", "message": "A source URL and 64-character SHA-256 receipt are required."})
    seen: dict[tuple[str, str, str, str, str], str] = {}
    for index, row in enumerate(records):
        if not isinstance(row, dict):
            errors.append({"row": index, "code": "malformed_row", "message": "Each release row must be an object."})
            continue
        division = row.get("division")
        if str(division) not in {"2", "3"} or isinstance(division, bool):
            errors.append({"row": index, "code": "missing_or_invalid_division", "message": "Rows must carry an explicit division value of 2 or 3."})
        scope_errors = []
        if row.get("sport") != "basketball":
            scope_errors.append("sport=basketball")
        if row.get("gender") != "women":
            scope_errors.append("gender=women")
        if scope_errors:
            errors.append({"row": index, "code": "missing_or_invalid_scope", "fields": scope_errors, "message": "Rows must carry the women’s basketball scope."})
        missing = [field for field in ("season", "team_id", "team_display_name", "athlete_id", "athlete_display_name") if row.get(field) in (None, "")]
        if missing:
            errors.append({"row": index, "code": "missing_identity", "fields": missing, "message": "Stable season, team, and athlete identities are required."})
        key = (str(row.get("season", "")), str(division), str(row.get("team_id", "")), str(row.get("athlete_id", "")))
        # Category/stat label is part of the identity for normalized stat
        # releases; preserving it prevents legitimate multi-stat rows from
        # being treated as duplicates.
        stat_key = str(row.get("stat_label") or row.get("stat_name") or row.get("metric") or "")
        key = (*key, stat_key)
        payload = json.dumps(row, sort_keys=True, ensure_ascii=False, default=str)
        prior = seen.get(key)
        if prior is None:
            seen[key] = payload
        elif prior != payload:
            errors.append({"row": index, "code": "conflicting_duplicate", "message": "Conflicting duplicate identity/stat rows are rejected."})
    return {"accepted": not errors, "rows": len(records), "errors": errors}


def inspect_retained_assets(
    root: Path = ROOT / ".local/womens-basketball",
) -> list[dict[str, Any]]:
    """Build exact schema/receipt evidence for every retained WBB parquet.

    The audit records what the files contain, including the absence of
    division fields.  It never infers a division from a school name,
    conference, or the non-D1 schedule flag.
    """
    try:
        import polars as pl
    except ImportError:
        return []
    assets: list[dict[str, Any]] = []
    for path in sorted(root.glob("*.parquet")):
        try:
            schema = pl.scan_parquet(path).collect_schema()
            columns = list(schema.keys())
            rows = int(pl.scan_parquet(path).select(pl.len()).collect().item())
        except Exception as exc:  # pragma: no cover - defensive release audit
            assets.append({"asset": path.name, "status": "unreadable", "error": str(exc)})
            continue
        receipt_path = Path(f"{path}.receipt.json")
        receipt: dict[str, Any] = {}
        if receipt_path.exists():
            try:
                loaded = json.loads(receipt_path.read_text())
                if isinstance(loaded, dict):
                    receipt = loaded
            except json.JSONDecodeError:
                receipt = {}
        division_fields = [field for field in columns if field.lower() in DIVISION_FIELDS]
        identity_fields = [field for field in columns if field.lower() in IDENTITY_FIELDS]
        signal_fields = [field for field in columns if field.lower() in ("away_non_div1_team", "home_non_div1_team")]
        assets.append(
            {
                "asset": path.name,
                "dataset": receipt.get("dataset") or path.stem.rsplit("_", 1)[0],
                "season": receipt.get("season"),
                "rows": rows,
                "columns": len(columns),
                "division_fields": division_fields,
                "identity_fields": identity_fields,
                "non_d1_signal_fields": signal_fields,
                "receipt": {
                    "sha256": receipt.get("sha256"),
                    "url": receipt.get("url"),
                    "valid": _receipt_is_valid(receipt),
                },
                "scope_status": "explicit_division_field_present" if division_fields else "no_explicit_division_field",
            }
        )
    return assets


def build_readiness(
    edition: dict[str, Any],
    schedule_rows: list[dict[str, Any]],
    asset_evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return a division contract from observed fields only.

    ``away_non_div1_team`` is a source flag, not a D2/D3 classification.  It
    is retained as an auditable signal and deliberately never counted under
    either division.
    """
    flagged = []
    for row in schedule_rows:
        if row.get("away_non_div1_team") is not True:
            continue
        flagged.append(
            {
                "game_id": str(row.get("game_id") or row.get("id") or ""),
                "date": row.get("date") or row.get("start_date"),
                "home": row.get("home_display_name") or row.get("home_name"),
                "away": row.get("away_display_name") or row.get("away_name"),
                "source_flag": "away_non_div1_team",
            }
        )
    flagged.sort(key=lambda row: (str(row.get("date") or ""), row["game_id"]))
    coverage = edition.get("coverage") or {}
    receipts = edition.get("receipts") or {}
    source = {
        "release": "SportsDataverse women’s college basketball bulk release",
        "schedule_receipt": receipts.get("schedule") or {},
        "observed_season": edition.get("observed_player_season"),
        "target_season": edition.get("season"),
    }
    assets = asset_evidence or []
    assets_with_division = [asset for asset in assets if asset.get("division_fields")]
    assets_with_receipts = [asset for asset in assets if (asset.get("receipt") or {}).get("valid") is True]
    audit = {
        "status": "blocked_by_missing_explicit_division_labels" if assets and not assets_with_division else "needs_review",
        "assets_inspected": len(assets),
        "assets_with_explicit_division": len(assets_with_division),
        "assets_with_valid_receipt": len(assets_with_receipts),
        "explicit_division_fields": sorted({field for asset in assets for field in asset.get("division_fields", [])}),
        "method": "Parquet schemas and immutable receipt sidecars were inspected; school names, conferences, and non-D1 flags are not classifiers.",
    }
    return {
        "schema_version": 2,
        "sport": "basketball",
        "gender": "women",
        "generated_at": edition.get("generated_at") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": source,
        "asset_audit": audit,
        "retained_assets": assets,
        "published": {
            "division": "1",
            "status": "published",
            "player_rows": int(coverage.get("players") or 0),
            "team_rows": int(coverage.get("team_stats_teams") or 0),
            "upcoming_games": int(coverage.get("upcoming_games") or 0),
        },
        "divisions": {
            "2": {
                "status": "unavailable",
                "rows": 0,
                "reason": "The retained release has no complete Division II player/team tables or explicit D2 label.",
            },
            "3": {
                "status": "unavailable",
                "rows": 0,
                "reason": "The retained release has no complete Division III player/team tables or explicit D3 label.",
            },
        },
        "non_division_one_schedule_signals": {
            "rows": len(flagged),
            "classification": "unresolved_non_d1",
            "note": "The source flag identifies non-Division-I opponents but does not distinguish Division II from Division III. These games are excluded from D2/D3 counts and forecasts.",
            "games": flagged,
        },
        "import_contract": {
            "required_scope_fields": ["sport", "gender", "division", "season"],
            "required_identity_fields": ["team_id", "team_display_name", "athlete_id", "athlete_display_name"],
            "required_receipt_fields": ["url", "sha256"],
            "accepted_division_values": [2, 3, "2", "3"],
            "acceptance_rules": [
                "Require an explicit source division value of 2 or 3 before publishing D2/D3 rows.",
                "Require stable team and athlete identifiers and a source receipt hash.",
                "Reject conflicting duplicate identity/stat rows instead of choosing a last row.",
                "Keep unresolved non-D1 schedule signals outside D2/D3 counts until classified.",
                "Reject a release batch if any row is missing the required fields or if the same identity/stat key has conflicting values.",
            ],
            "next_required_inputs": [
                "A lawful women’s D2/D3 schedule, team, and player release with explicit division labels.",
                "A source receipt and field-level validation for each imported season.",
            ],
        },
        "limitations": [
            "No women’s D2 or D3 rows are fabricated or substituted from D1.",
            "The current source flag is non-D1 only; it cannot identify D2 versus D3.",
        ],
    }


def main() -> None:
    edition = json.loads(EDITION.read_text())
    if not SCHEDULE.exists():
        rows: list[dict[str, Any]] = []
    else:
        import polars as pl

        rows = pl.read_parquet(SCHEDULE).to_dicts()
    OUT.write_text(json.dumps(build_readiness(edition, rows, inspect_retained_assets()), ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(rows):,} schedule rows inspected)")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT / "ncaa_scraper"))
    main()
