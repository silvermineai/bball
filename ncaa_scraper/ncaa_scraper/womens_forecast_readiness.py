"""Readiness gates for a separate women's basketball forecast.

The men's efficiency model requires chronological schedule/team-box history,
paired final scores, and an independent calibration season.  This module
describes that contract for WBB without fitting a model or reusing men's
coefficients.  A missing release asset stays missing; it is never represented
as a zero row or inferred from the observed player edition.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


WBB_RELEASE_ROOT = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
DEFAULT_TARGET_SEASON = 2027
HISTORICAL_SEASONS = (2023, 2024, 2025, 2026)

RELEASES = {
    "schedule": (
        "espn_womens_college_basketball_schedules",
        "wbb_schedule_{season}.parquet",
    ),
    "team_box": (
        "espn_womens_college_basketball_team_boxscores",
        "team_box_{season}.parquet",
    ),
}


def release_url(dataset: str, season: int) -> str:
    tag, template = RELEASES[dataset]
    return f"{WBB_RELEASE_ROOT}/{tag}/{template.format(season=season)}"


def _asset_status(cache: Path, dataset: str, season: int) -> dict:
    tag, template = RELEASES[dataset]
    filename = template.format(season=season)
    path = cache / filename
    receipt_path = cache / f"{filename}.receipt.json"
    receipt = {}
    if receipt_path.exists():
        try:
            receipt = json.loads(receipt_path.read_text())
        except (OSError, ValueError):
            receipt = {}
    present = path.exists() and path.stat().st_size > 0
    verified = False
    if present and receipt.get("sha256"):
        verified = hashlib.sha256(path.read_bytes()).hexdigest() == receipt["sha256"]
    return {
        "dataset": dataset,
        "season": season,
        "release_tag": tag,
        "asset": filename,
        "url": release_url(dataset, season),
        "local_present": present,
        "receipt_present": receipt_path.exists(),
        "hash_verified": verified,
        "status": "ready" if verified else "missing",
    }


def assess(cache: Path, target_season: int = DEFAULT_TARGET_SEASON) -> dict:
    """Return a publication gate for a WBB target season.

    Four completed historical seasons are intentional: the efficiency model
    fits before the calibration season, calibrates on the next season, and
    retains a following season as an independent check before issuing target
    forecasts.  The target schedule is useful context but cannot provide a
    training outcome.
    """

    historical = [
        _asset_status(cache, dataset, season)
        for dataset in ("schedule", "team_box")
        for season in HISTORICAL_SEASONS
    ]
    target_schedule = _asset_status(cache, "schedule", target_season)
    checks = [
        {
            "key": "historical_schedule",
            "label": "Completed WBB schedules",
            "status": "ready" if all(row["status"] == "ready" for row in historical if row["dataset"] == "schedule") else "missing",
            "detail": "2023–26 schedules are required to build chronological training, calibration and test cohorts.",
            "required": "schedule rows with game ID, season, teams, final scores, status and neutral-site flag",
        },
        {
            "key": "historical_team_box",
            "label": "Completed WBB team boxes",
            "status": "ready" if all(row["status"] == "ready" for row in historical if row["dataset"] == "team_box") else "missing",
            "detail": "2023–26 team-box rows are required to compute paired efficiency and pace inputs.",
            "required": "two final team rows per game keyed by game ID and team ID, with FGA, FTA, offensive rebounds and turnovers",
        },
        {
            "key": "paired_games",
            "label": "Paired completed games",
            "status": "blocked",
            "detail": "Cannot count valid joins until every historical schedule and team-box release is imported and reconciled.",
            "required": "at least 100 valid completed games after score, period and pace checks",
        },
        {
            "key": "wbb_calibration",
            "label": "Women’s calibration and holdout",
            "status": "blocked",
            "detail": "No WBB coefficients or probabilities are published until calibration is fit on women’s games and a later season remains independent.",
            "required": "independent calibration season plus a later held-out evaluation with winner, margin and interval metrics",
        },
        {
            "key": "target_schedule",
            "label": f"{target_season} WBB target schedule",
            "status": target_schedule["status"],
            "detail": "Upcoming schedule rows are context only until a separate WBB model passes the historical gates.",
            "required": "scheduled games with stable game and team IDs",
        },
    ]
    missing = [
        {
            "dataset": row["dataset"],
            "season": row["season"],
            "release_tag": row["release_tag"],
            "asset": row["asset"],
            "url": row["url"],
            "next_step": f"Import and hash-verify {row['asset']} from its tagged release before fitting WBB.",
        }
        for row in historical
        if row["status"] != "ready"
    ]
    ready = not missing and all(check["status"] == "ready" for check in checks[:2])
    return {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "target_season": target_season,
        "status": "ready_for_fit" if ready else "blocked",
        "model_id": None,
        "forecast_rows": 0,
        "model_boundary": "No women’s forecast is published. Men’s coefficients, calibration, IDs and forecast rows are never substituted.",
        "checks": checks,
        "assets": historical + [target_schedule],
        "missing_inputs": missing,
        "next_steps": [
            "Import and hash-verify all 2023–26 women’s schedule and team-box releases under their exact release tags.",
            "Join only on stable game and team IDs; retain unmatched, duplicate and invalid rows in the audit output.",
            "Run a women’s-only chronological fit, then calibrate on one completed season and evaluate on the following season.",
            "Register a WBB model ID and expose game probabilities only after the held-out metrics and source clocks pass publication checks.",
        ],
    }
