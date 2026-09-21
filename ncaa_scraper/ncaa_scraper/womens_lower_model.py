"""Bounded, receipt-backed ratings for NCAA women's DII/DIII basketball.

The NCAA lower-division schedule release currently provides one completed
season with an exact ``division`` request, contest IDs, publisher team slugs,
and final scores.  That is enough for a historical, within-season ridge margin
rating and an honest chronological backtest.  It is not enough to publish a
2026-27 forecast: no target-season schedule is present and there is no
multi-season lower-division history in the retained release.

This module therefore never fabricates future games, never joins publisher
slugs to another provider by name, and never labels a descriptive rating as a
forecast.  Teams without a source slug are retained in exclusion counts but do
not enter the model because a name-only key is unsafe.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime
from typing import Any

import numpy as np

MODEL_VERSION = "wbb-lower-ratings-v1"
TARGET_SEASON = 2027
TARGET_SOURCE_SEASON_YEAR = 2026


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _date_key(value: Any) -> str:
    text = str(value or "")
    try:
        if len(text) == 10 and text[2] == "/" and text[5] == "/":
            return datetime.strptime(text, "%m/%d/%Y").date().isoformat()
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return text


def _team_slug(team: dict[str, Any]) -> str | None:
    value = team.get("slug")
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value or None


def normalize_final_games(contests: list[dict[str, Any]], division: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Retain only exact-scope finals with two distinct source team slugs."""
    if division not in (2, 3):
        raise ValueError("division must be 2 or 3")
    games: list[dict[str, Any]] = []
    seen: set[str] = set()
    excluded = {
        "wrong_division": 0,
        "non_final": 0,
        "malformed_teams": 0,
        "missing_slug": 0,
        "duplicate_team": 0,
        "invalid_score": 0,
        "duplicate_contest": 0,
    }
    for contest in contests:
        if not isinstance(contest, dict) or contest.get("division") != division:
            excluded["wrong_division"] += 1
            continue
        state = str(contest.get("state") or "").upper()
        status = str(contest.get("status") or "").casefold()
        if state != "F" and status != "final":
            excluded["non_final"] += 1
            continue
        contest_id = contest.get("contest_id")
        if isinstance(contest_id, bool) or not isinstance(contest_id, int) or contest_id <= 0:
            excluded["malformed_teams"] += 1
            continue
        key = str(contest_id)
        if key in seen:
            excluded["duplicate_contest"] += 1
            continue
        seen.add(key)
        teams = contest.get("teams")
        if not isinstance(teams, list) or len(teams) != 2 or not all(isinstance(team, dict) for team in teams):
            excluded["malformed_teams"] += 1
            continue
        home = next((team for team in teams if team.get("home") is True), teams[0])
        away = next((team for team in teams if team.get("home") is False and team is not home), teams[1])
        home_id = _team_slug(home)
        away_id = _team_slug(away)
        if not home_id or not away_id:
            excluded["missing_slug"] += 1
            continue
        if home_id == away_id:
            excluded["duplicate_team"] += 1
            continue
        home_score = _number(home.get("score"))
        away_score = _number(away.get("score"))
        if home_score is None or away_score is None or home_score < 0 or away_score < 0:
            excluded["invalid_score"] += 1
            continue
        games.append({
            "game_id": key,
            "date": contest.get("contest_date"),
            "date_key": _date_key(contest.get("contest_date")),
            "division": division,
            "home_id": home_id,
            "away_id": away_id,
            "home": home.get("name") or home_id,
            "away": away.get("name") or away_id,
            "home_conference": home.get("conference"),
            "away_conference": away.get("conference"),
            "home_score": int(home_score) if home_score.is_integer() else home_score,
            "away_score": int(away_score) if away_score.is_integer() else away_score,
        })
    games.sort(key=lambda row: (row["date_key"], row["game_id"]))
    return games, excluded


def _fit(games: list[dict[str, Any]], ridge: float = 12.0) -> dict[str, Any]:
    teams = sorted({game["home_id"] for game in games} | {game["away_id"] for game in games})
    index = {team: i for i, team in enumerate(teams)}
    # Team ratings plus one unpenalized home-court coefficient.
    design = np.zeros((len(games), len(teams) + 1), dtype=float)
    target = np.zeros(len(games), dtype=float)
    for row, game in enumerate(games):
        design[row, index[game["home_id"]]] = 1.0
        design[row, index[game["away_id"]]] = -1.0
        design[row, -1] = 1.0
        target[row] = float(game["home_score"] - game["away_score"])
    penalty = np.eye(len(teams) + 1, dtype=float) * ridge
    penalty[-1, -1] = 0.0
    coefficients = np.linalg.solve(design.T @ design + penalty, design.T @ target)
    return {"ratings": {team: float(coefficients[i]) for team, i in index.items()}, "home_advantage": float(coefficients[-1]), "teams": teams, "ridge": ridge}


def _predict(model: dict[str, Any], game: dict[str, Any]) -> float | None:
    ratings = model["ratings"]
    if game["home_id"] not in ratings or game["away_id"] not in ratings:
        return None
    return ratings[game["home_id"]] - ratings[game["away_id"]] + model["home_advantage"]


def _backtest(games: list[dict[str, Any]], split: float = 0.8) -> dict[str, Any]:
    if len(games) < 200:
        return {"status": "blocked", "reason": "At least 200 exact-scope finals are required for a chronological holdout.", "training_games": 0, "holdout_games": 0, "evaluated_games": 0}
    cut = max(100, min(len(games) - 100, int(len(games) * split)))
    training = games[:cut]
    holdout = games[cut:]
    model = _fit(training)
    errors: list[float] = []
    winner_hits = 0
    for game in holdout:
        predicted = _predict(model, game)
        if predicted is None:
            continue
        actual = float(game["home_score"] - game["away_score"])
        errors.append(abs(predicted - actual))
        if (predicted > 0) == (actual > 0):
            winner_hits += 1
    if not errors:
        return {"status": "blocked", "reason": "No holdout games retained both exact source team slugs.", "training_games": len(training), "holdout_games": len(holdout), "evaluated_games": 0}
    return {
        "status": "retrospective_only",
        "method": "Chronological 80/20 within-season holdout; ratings fit only on the earlier games and no target-season rows are used.",
        "training_games": len(training),
        "holdout_games": len(holdout),
        "evaluated_games": len(errors),
        "holdout_start": holdout[0]["date"],
        "holdout_end": holdout[-1]["date"],
        "margin_mae": round(float(np.mean(errors)), 4),
        "winner_accuracy": round(winner_hits / len(errors), 4),
    }


def _ratings(games: list[dict[str, Any]], model: dict[str, Any]) -> list[dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = {}
    for game in games:
        for side in ("home", "away"):
            team_id = game[f"{side}_id"]
            team = stats.setdefault(team_id, {"team_id": team_id, "team": game[side], "conference": game[f"{side}_conference"], "games": 0, "wins": 0, "losses": 0, "points_for": 0.0, "points_against": 0.0})
            score = float(game[f"{side}_score"])
            opponent = float(game["away_score" if side == "home" else "home_score"])
            team["games"] += 1
            team["wins"] += int(score > opponent)
            team["losses"] += int(score < opponent)
            team["points_for"] += score
            team["points_against"] += opponent
    rows = []
    for team_id, row in stats.items():
        margin = (row["points_for"] - row["points_against"]) / row["games"]
        rating = model["ratings"].get(team_id, 0.0)
        rows.append({
            **row,
            "points_for": round(row["points_for"], 2),
            "points_against": round(row["points_against"], 2),
            "win_pct": round(row["wins"] / row["games"], 4),
            "avg_margin": round(margin, 4),
            "rating": round(rating, 4),
        })
    rows.sort(key=lambda row: (-row["rating"], -row["win_pct"], row["team"], row["team_id"]))
    for rank, row in enumerate(rows, 1):
        row["rank"] = rank
    return rows


def build_division_artifact(
    contests: list[dict[str, Any]],
    division: int,
    *,
    source_receipts: list[dict[str, Any]] | None = None,
    source_asset_sha256: str | None = None,
    target_schedule_present: bool = False,
) -> dict[str, Any]:
    """Build one division's research-only rating artifact."""
    games, excluded = normalize_final_games(contests, division)
    model = _fit(games) if len(games) >= 2 else {"ratings": {}, "home_advantage": 0.0, "teams": [], "ridge": 12.0}
    backtest = _backtest(games)
    receipts = source_receipts or []
    source_receipt_digest = hashlib.sha256(json.dumps(receipts, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    payload = {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "division": division,
        "season": 2025,
        "target_season": TARGET_SEASON,
        "model_status": "research_only",
        "forecast_status": "not_published",
        "method": "Within-season ridge margin ratings using exact NCAA source team slugs, final scores, and a fitted home-court term. Ratings are descriptive historical evidence, not a 2026-27 forecast.",
        "coverage": {
            "source_contests": len([row for row in contests if isinstance(row, dict) and row.get("division") == division]),
            "valid_final_games": len(games),
            "teams": len(model["teams"]),
            "excluded": excluded,
            "source_receipts": len(receipts),
        },
        "quality": {
            "exact_division": True,
            "stable_team_key": "publisher team slug; rows without slug are excluded",
            "identity_join": "none; no name-only join to ESPN, SportsDataverse, or another provider",
            "duplicate_contest_ids_rejected": excluded["duplicate_contest"],
        },
        "fit": {"ridge": model["ridge"], "home_advantage": round(model["home_advantage"], 4), "training_games": len(games), "training_season": 2025},
        "backtest": backtest,
        "ratings": _ratings(games, model),
        "target_schedule": {
            "season": TARGET_SEASON,
            "source_season_year": TARGET_SOURCE_SEASON_YEAR,
            "status": "ready" if target_schedule_present else "missing",
            "games": 0,
            "note": "No 2026-27 NCAA lower-division schedule rows are present in the retained exact-division capture." if not target_schedule_present else "Exact target schedule is available for a separately validated forecast.",
        },
        "source": {
            "schedule_asset_sha256": source_asset_sha256,
            "receipt_count": len(receipts),
            "receipt_digest": source_receipt_digest,
            "receipts": receipts,
        },
        "readiness": [
            {"key": "exact_division", "status": "ready", "detail": f"Every retained row was requested with NCAA division={division}."},
            {"key": "stable_team_identity", "status": "ready", "detail": "Publisher team slugs are used as source-local keys; missing slugs are excluded."},
            {"key": "paired_final_scores", "status": "ready" if len(games) >= 100 else "blocked", "detail": f"{len(games):,} finals retain two teams, scores, and contest IDs."},
            {"key": "chronological_holdout", "status": backtest.get("status", "blocked"), "detail": backtest.get("method") or backtest.get("reason", "No backtest available.")},
            {"key": "target_schedule", "status": "ready" if target_schedule_present else "blocked", "detail": "A future-game forecast requires a target-season schedule with the same exact scope."},
            {"key": "multi_season_history", "status": "blocked", "detail": "Only the 2025 NCAA seasonYear capture is retained; one season cannot establish interseason transfer or roster continuity."},
        ],
        "limitations": [
            "This is a historical within-season rating and backtest, not a published prediction model.",
            "No 2026-27 target schedule is present, so no future lower-division game probabilities or scores are emitted.",
            "The model uses final scores and venue only; player availability, transfers, injuries, and opponent-strength priors are not modeled.",
            "Rows missing a publisher team slug remain in exclusion counts and never become name-derived identities.",
        ],
    }
    digest_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    payload["model_id"] = f"{MODEL_VERSION}-d{division}-{hashlib.sha256(digest_payload).hexdigest()[:12]}"
    return payload
