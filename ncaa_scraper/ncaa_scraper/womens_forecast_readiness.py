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
# The WBB challenger fits 2023–25 and uses 2026 as a chronological holdout.
# Schedule history is not required for the fit because the team-box release
# carries stable game IDs and final scores; the target schedule remains a
# separate input for upcoming rows.
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


def _target_schedule_snapshot(path: Path) -> dict:
    """Read the minimum target-schedule identity needed for forecast joins.

    The release receipt proves which bytes were retained, but it does not prove
    that a published forecast still contains the same slate.  Keep this check
    deliberately small: compare pregame game IDs and participant IDs, without
    importing the full parquet into the readiness artifact.
    """
    try:
        import pyarrow.parquet as parquet

        table = parquet.read_table(
            path,
            columns=["game_id", "home_id", "away_id", "status_type_state"],
        )
    except Exception as exc:  # pragma: no cover - parquet/runtime dependent
        return {"error": f"unable to read retained target schedule: {exc}"}

    source: dict[str, tuple[str, str]] = {}
    invalid_rows = 0
    duplicate_ids = 0
    for row in table.to_pylist():
        state = str(row.get("status_type_state") or "").strip().casefold()
        if state != "pre":
            continue
        game_id = str(row.get("game_id") or "").strip()
        home_id = str(row.get("home_id") or "").strip()
        away_id = str(row.get("away_id") or "").strip()
        if not game_id or not home_id or not away_id or home_id == away_id:
            invalid_rows += 1
            continue
        if game_id in source:
            duplicate_ids += 1
            continue
        source[game_id] = (home_id, away_id)
    return {
        "source_rows": len(source),
        "invalid_rows": invalid_rows,
        "duplicate_ids": duplicate_ids,
        "source_games": source,
    }


def assess(
    cache: Path,
    target_season: int = DEFAULT_TARGET_SEASON,
    forecast_path: Path | None = None,
    target_schedule_path: Path | None = None,
) -> dict:
    """Return a publication gate for a WBB target season.

    Three seasons fit the ratings and the latest completed season is a
    chronological holdout. A separately fitted probability calibration
    artifact is required before forecast rows can be treated as publishable.
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
            "detail": "2023–26 schedules provide the game IDs and chronology needed to reconcile team boxes.",
            "required": "season, teams, stable game IDs and final status for every retained historical edition",
        },
        {
            "key": "historical_team_box",
            "label": "Completed WBB team boxes",
            "status": "ready" if all(row["status"] == "ready" for row in historical if row["dataset"] == "team_box") else "missing",
            "detail": "2023–25 ratings and a chronological 2026 holdout are required to compute team strength and outcomes.",
            "required": "two final team rows per game keyed by game ID and team ID, with scores and stable team IDs",
        },
        {
            "key": "paired_games",
            "label": "Paired completed games",
            "status": "blocked",
            "detail": "Cannot count valid joins until the two team-box releases are reconciled.",
            "required": "at least 100 valid completed games after score and duplicate checks",
        },
        {
            "key": "wbb_probability_calibration",
            "label": "Women’s probability calibration",
            "status": "blocked",
            "detail": "The published artifact must carry women’s-only calibration coefficients and held-out probability metrics.",
            "required": "women’s calibration coefficients, calibration-game count and held-out Brier/log-loss evidence",
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
    forecast = {}
    if forecast_path and forecast_path.exists():
        try:
            forecast = json.loads(forecast_path.read_text())
        except (OSError, ValueError):
            forecast = {}
    validation = forecast.get("validation")
    paired_games_ready = (
        isinstance(validation, dict)
        and isinstance(validation.get("games"), (int, float))
        and validation["games"] >= 100
    )
    paired_check = next(check for check in checks if check["key"] == "paired_games")
    paired_check["status"] = "ready" if paired_games_ready and not missing else "blocked"
    if paired_games_ready:
        paired_check["detail"] = f"The artifact reports {int(validation['games']):,} completed 2026 holdout games after the multi-season model join."
    calibration = forecast.get("calibration")
    interval_ready = (
        isinstance(calibration, dict)
        and isinstance(calibration.get("margin_half_width"), (int, float))
        and calibration["margin_half_width"] > 0
        and isinstance(validation, dict)
        and isinstance(validation.get("interval_games"), (int, float))
        and validation["interval_games"] >= 100
        and isinstance(validation.get("interval_coverage"), (int, float))
        and 0 <= validation["interval_coverage"] <= 1
    )
    calibration_ready = (
        isinstance(calibration, dict)
        and isinstance(calibration.get("games"), (int, float))
        and calibration["games"] >= 100
        and isinstance(calibration.get("logistic_coefficients"), list)
        and len(calibration["logistic_coefficients"]) == 2
        and isinstance(calibration.get("brier"), (int, float))
        and isinstance(calibration.get("log_loss"), (int, float))
        and interval_ready
    )
    calibration_check = next(check for check in checks if check["key"] == "wbb_probability_calibration")
    calibration_check["status"] = "ready" if calibration_ready and not missing else "blocked"
    if calibration_ready:
        calibration_check["detail"] = "A women’s probability calibration and margin interval are attached to the multi-season artifact and can be audited against its holdout."
    if not calibration_ready:
        missing.append({
            "dataset": "model_calibration",
            "season": target_season - 1,
            "release_tag": "silvermine-wbb-model",
            "asset": "womens-forecast.json#calibration",
            "url": "",
            "next_step": "Fit and persist women’s calibration coefficients with Brier and log-loss evidence before publishing probabilities.",
        })
    forecast_rows = forecast.get("forecasts")
    # Input and calibration gates are not enough to publish an arbitrary JSON
    # file as a WBB forecast. Require the artifact identity and a basic unique
    # game-row contract here; the deeper arithmetic/model-input checks remain
    # in check_live_publication.py.
    forecast_ids: list[str] = []
    forecast_rows_valid = isinstance(forecast_rows, list) and bool(forecast_rows)
    if forecast_rows_valid:
        for row in forecast_rows:
            if not isinstance(row, dict):
                forecast_rows_valid = False
                break
            game_id = row.get("game_id")
            home_id = row.get("home_id")
            away_id = row.get("away_id")
            if (
                not isinstance(game_id, str)
                or not game_id.strip()
                or not isinstance(home_id, str)
                or not home_id.strip()
                or not isinstance(away_id, str)
                or not away_id.strip()
                or home_id == away_id
                or not isinstance(row.get("date"), str)
                or not isinstance(row.get("prediction"), dict)
            ):
                forecast_rows_valid = False
                break
            forecast_ids.append(game_id)
    forecast_contract_ready = (
        forecast.get("sport") == "basketball"
        and forecast.get("gender") == "women"
        and forecast.get("target_season") == target_season
        and forecast.get("model_status") == "published"
        and isinstance(forecast.get("model_id"), str)
        and forecast["model_id"].startswith("womens-basketball-")
        and forecast_rows_valid
        and len(forecast_ids) == len(set(forecast_ids))
    )
    target_alignment = None
    if target_schedule_path is not None:
        target_alignment = _target_schedule_snapshot(target_schedule_path)
        forecast_games = {
            str(row.get("game_id")): (
                str(row.get("home_id") or ""),
                str(row.get("away_id") or ""),
            )
            for row in (forecast_rows if isinstance(forecast_rows, list) else [])
            if isinstance(row, dict) and row.get("game_id") is not None
        }
        if "error" in target_alignment:
            target_alignment_ready = False
            alignment_detail = target_alignment["error"]
        else:
            source_games = target_alignment.pop("source_games")
            missing_forecasts = sorted(set(source_games) - set(forecast_games))
            extra_forecasts = sorted(set(forecast_games) - set(source_games))
            participant_mismatches = sorted(
                game_id
                for game_id in set(source_games) & set(forecast_games)
                if source_games[game_id] != forecast_games[game_id]
            )
            target_alignment.update({
                "forecast_rows": len(forecast_games),
                "missing_forecasts": len(missing_forecasts),
                "extra_forecasts": len(extra_forecasts),
                "participant_mismatches": len(participant_mismatches),
            })
            target_alignment_ready = (
                target_alignment["invalid_rows"] == 0
                and target_alignment["duplicate_ids"] == 0
                and not missing_forecasts
                and not extra_forecasts
                and not participant_mismatches
            )
            alignment_detail = (
                f"{len(source_games):,} pregame source rows reconcile to the published "
                "forecast IDs and participant IDs."
                if target_alignment_ready
                else "The published forecast slate does not exactly reconcile to the "
                "retained target schedule; no stale or partial slate is publishable."
            )
        checks.append({
            "key": "target_schedule_alignment",
            "label": f"{target_season} WBB forecast-to-schedule alignment",
            "status": "ready" if target_alignment_ready else "blocked",
            "detail": alignment_detail,
            "required": "one forecast row for every retained pregame source row with matching game and participant IDs",
        })
        if not target_alignment_ready:
            missing.append({
                "dataset": "target_schedule_alignment",
                "season": target_season,
                "release_tag": "silvermine-wbb-model",
                "asset": "womens-forecast.json#forecasts",
                "url": "",
                "next_step": "Regenerate the women’s forecast from the retained target schedule and rerun readiness before publication.",
            })
    checks.append({
        "key": "published_forecast_contract",
        "label": "Published WBB forecast contract",
        "status": "ready" if forecast_contract_ready else "blocked",
        "detail": "The forecast artifact carries the women’s scope, target season, published model identity, and unique game rows with team IDs, dates, and predictions." if forecast_contract_ready else "A forecast artifact is not publishable until its women’s scope, target season, model status, and unique game-row identity are present.",
        "required": "sport=basketball, gender=women, target season, published WBB model ID, unique games, team IDs, dates, and prediction objects",
    })
    fit_ready = not missing and all(check["status"] == "ready" for check in checks if check["key"] != "published_forecast_contract")
    published = fit_ready and forecast_contract_ready
    status = "published" if published else "ready_for_fit" if fit_ready else "blocked"
    model_id = forecast.get("model_id") if published else None
    model_boundary = (
        "A women’s-only multi-season forecast is published from separately retained team-box history. Men’s coefficients, calibration, IDs and forecast rows are never substituted."
        if published
        else "A women’s-only fit has passed its input gates, but no published forecast edition is present. Men’s coefficients, calibration, IDs and forecast rows are never substituted."
        if fit_ready
        else "No women’s forecast is published. Men’s coefficients, calibration, IDs and forecast rows are never substituted."
    )
    return {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "target_season": target_season,
        "status": status,
        "model_id": model_id,
        "forecast_rows": len(forecast_rows) if published else 0,
        "model_boundary": model_boundary,
        "checks": checks,
        "assets": historical + [target_schedule],
        "missing_inputs": missing,
        **({"target_schedule_alignment": target_alignment} if target_alignment is not None else {}),
        "next_steps": [
            "Import and hash-verify the 2023–26 women’s schedule and team-box releases under their exact release tags.",
            "Join only on stable game and team IDs; retain unmatched, duplicate and invalid rows in the audit output.",
            "Run a women’s-only chronological fit, then calibrate on one completed season and evaluate on the following season.",
            "Register a WBB model ID and expose game probabilities only after the held-out metrics and source clocks pass publication checks.",
        ],
    }
