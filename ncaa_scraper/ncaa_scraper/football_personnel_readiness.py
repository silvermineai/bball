"""Build an auditable, research-only football personnel feature readiness file.

The primary football forecast intentionally remains score, venue and team
identity only.  This module joins the retained exact-team personnel releases
to the *upcoming forecast slate* so we can measure which recruiting and
returning-production fields are available before deciding whether they are
safe enough to fit as future model features.  It never changes a prediction
or registers a challenger forecast.
"""

from __future__ import annotations

import hashlib
import json
import math
import sqlite3
from datetime import datetime, timezone


PERSONNEL_FIELDS = (
    "talent_composite",
    "talent_rank",
    "blue_chip_ratio",
    "off_returning",
    "def_returning",
    "overall_returning",
)
PERSONNEL_DATASETS = ("team_talent", "returning_production")


def _number(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _digest(value) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]


def _safe_json(value):
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _personnel_rows(conn: sqlite3.Connection, season: int):
    """Return one source row per exact team/dataset, preserving conflicts."""
    rows = {}
    for dataset in PERSONNEL_DATASETS:
        for row in conn.execute(
            "SELECT team_id,record_key,stats_json FROM football_stats "
            "WHERE dataset=? AND season=? ORDER BY team_id,record_key",
            (dataset, season),
        ):
            team_id = str(row[0]) if row[0] not in (None, "") else None
            if not team_id:
                continue
            payload = _safe_json(row[2])
            target = rows.setdefault((team_id, dataset), [])
            payload["_record_key"] = row[1]
            target.append(payload)
    return rows


def _receipt_map(conn: sqlite3.Connection, season: int):
    receipts = {}
    for row in conn.execute(
        "SELECT dataset,receipt_json FROM football_sources "
        "WHERE season=? AND dataset IN ('team_talent','returning_production')",
        (season,),
    ):
        payload = _safe_json(row[1])
        if payload.get("fetched_at") and payload.get("sha256"):
            receipts[row[0]] = {
                "dataset": row[0],
                "season": season,
                "fetched_at": payload["fetched_at"],
                "sha256": payload["sha256"],
            }
    return receipts


def _team_context(team_id: str, rows):
    values = {}
    source_datasets = []
    conflicts = []
    for dataset in PERSONNEL_DATASETS:
        payloads = rows.get((team_id, dataset), [])
        if not payloads:
            continue
        source_datasets.append(dataset)
        for field in PERSONNEL_FIELDS:
            candidates = {
                value
                for payload in payloads
                if (value := _number(payload.get(field))) is not None
            }
            if len(candidates) > 1:
                conflicts.append(field)
            elif candidates:
                values[field] = next(iter(candidates))
    context = {
        "team_id": team_id,
        "team": None,
        "available_fields": sorted(values),
        "source_datasets": sorted(source_datasets),
        "conflicting_fields": sorted(set(conflicts)),
    }
    context.update({field: values.get(field) for field in PERSONNEL_FIELDS})
    return context


def _status(home, away):
    if home["conflicting_fields"] or away["conflicting_fields"]:
        return "conflict"
    available = len(set(home["available_fields"]) & set(away["available_fields"]))
    if available == len(PERSONNEL_FIELDS):
        return "complete"
    if available:
        return "partial"
    return "unavailable"


def build(
    conn: sqlite3.Connection,
    upcoming: list[dict],
    target_season: int = 2026,
    *,
    primary_model_id: str | None = None,
):
    """Return exact-ID context coverage for each forecasted upcoming game."""
    rows = _personnel_rows(conn, target_season)
    receipts = _receipt_map(conn, target_season)
    games = []
    for game in upcoming:
        if not game.get("prediction"):
            continue
        home = _team_context(str(game["home_id"]), rows)
        away = _team_context(str(game["away_id"]), rows)
        games.append(
            {
                "game_id": str(game["id"]),
                "kickoff": game.get("kickoff"),
                "home_id": str(game["home_id"]),
                "away_id": str(game["away_id"]),
                "home_name": game.get("home_name"),
                "away_name": game.get("away_name"),
                "home_division": game.get("home_division"),
                "away_division": game.get("away_division"),
                "model_id": (game.get("prediction") or {}).get("model_id"),
                "status": _status(home, away),
                "home": home,
                "away": away,
            }
        )
    counts = {status: sum(game["status"] == status for game in games) for status in ("complete", "partial", "conflict", "unavailable")}
    field_counts = {
        field: sum(
            field in game[side]["available_fields"]
            for game in games
            for side in ("home", "away")
        )
        for field in PERSONNEL_FIELDS
    }
    payload = {
        "version": "football-personnel-readiness-v1",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "target_season": target_season,
        "primary_model_id": primary_model_id,
        "scope": "Forecasted upcoming games only; exact team IDs from the retained personnel releases.",
        "coverage": {
            "forecast_games": len(games),
            "team_sides": len(games) * 2,
            "complete_games": counts["complete"],
            "partial_games": counts["partial"],
            "conflict_games": counts["conflict"],
            "unavailable_games": counts["unavailable"],
            "field_side_counts": field_counts,
            "personnel_teams": len({team_id for team_id, _ in rows}),
        },
        "feature_fields": list(PERSONNEL_FIELDS),
        "source_receipts": [receipts[key] for key in PERSONNEL_DATASETS if key in receipts],
        "limitations": [
            "This is feature readiness evidence, not a forecast and not a player availability ruling.",
            "Recruiting and returning-production fields remain outside the primary football model until leakage-safe dated validation is complete.",
            "Missing records do not imply a team has no talent or returning production; conflicting exact-team rows remain flagged.",
            "Team-level context does not establish eligibility, depth-chart order, injuries, transfers or expected snaps.",
        ],
        "games": games,
    }
    payload["id"] = "football-personnel-readiness-v1-" + _digest(payload)
    return payload
