"""Freshness and structural checks for published sport releases."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp has no timezone")
    return parsed.astimezone(timezone.utc)


def _read(root: Path, relative: str) -> dict:
    path = root / relative
    if not path.exists():
        raise ValueError(f"missing release: {relative}")
    try:
        value = json.loads(path.read_text())
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid JSON release: {relative}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"release is not an object: {relative}")
    return value


def _freshness(
    release: str,
    payload: dict,
    now: datetime,
    max_age_hours: float,
) -> dict:
    generated = payload.get("generated_at")
    if not isinstance(generated, str):
        raise ValueError(f"{release} has no generated_at timestamp")
    try:
        captured = _timestamp(generated)
    except ValueError as exc:
        raise ValueError(f"{release} has an invalid generated_at timestamp") from exc
    age_hours = (now - captured).total_seconds() / 3600
    if age_hours < -24:
        raise ValueError(f"{release} timestamp is more than 24 hours in the future")
    if age_hours > max_age_hours:
        raise ValueError(
            f"{release} is {age_hours:.1f} hours old; limit is {max_age_hours:.1f}"
        )
    return {"release": release, "generated_at": generated, "age_hours": round(max(0, age_hours), 2)}


def _season_snapshot(release: str, payload: dict) -> dict:
    """Describe a final-season snapshot without applying a weekly-age limit."""
    generated = payload.get("generated_at")
    if not isinstance(generated, str):
        raise ValueError(f"{release} has no generated_at timestamp")
    try:
        _timestamp(generated)
    except ValueError as exc:
        raise ValueError(f"{release} has an invalid generated_at timestamp") from exc
    return {"release": release, "generated_at": generated, "season_snapshot": True}


def check_freshness(
    root: Path,
    sport: str,
    *,
    now: datetime | None = None,
    max_age_hours: float = 240,
) -> dict:
    """Return a machine-readable health report; raise for a failed gate."""
    if sport not in {"basketball", "football", "both"}:
        raise ValueError("sport must be basketball, football or both")
    if max_age_hours <= 0:
        raise ValueError("max_age_hours must be positive")
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    sports = ["basketball", "football"] if sport == "both" else [sport]
    releases: list[dict] = []
    errors: list[str] = []
    for selected in sports:
        prefix = Path("frontend/public/data") / selected
        try:
            overview = _read(root, str(prefix / "overview.json"))
            releases.append(
                _freshness(
                    f"{selected}/overview.json", overview, now, max_age_hours
                )
            )
            coverage = overview.get("coverage")
            model = overview.get("model")
            if not isinstance(coverage, dict):
                raise ValueError(f"{selected}/overview.json has no coverage object")
            if not isinstance(model, dict) or not model.get("id"):
                raise ValueError(f"{selected}/overview.json has no model id")
            forecast_games = coverage.get("forecast_games")
            upcoming_games = coverage.get("upcoming_games")
            baseline_estimates = coverage.get("baseline_estimate_games", 0)
            if not all(
                isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0
                for value in (forecast_games, upcoming_games, baseline_estimates)
            ):
                raise ValueError(f"{selected}/overview.json has invalid forecast coverage counts")
            if selected == "basketball":
                if forecast_games > upcoming_games:
                    raise ValueError("basketball forecasts exceed upcoming games")
                if forecast_games + baseline_estimates > upcoming_games:
                    raise ValueError("basketball primary and baseline estimates exceed upcoming games")
                if not isinstance(overview.get("ratings"), list) or not overview["ratings"]:
                    raise ValueError("basketball release has no team ratings")
                ncaa = _read(root, str(prefix / "ncaa-individual.json"))
                releases.append(
                    _season_snapshot(
                        "basketball/ncaa-individual.json",
                        ncaa,
                    )
                )
                if ncaa.get("season") != overview.get("season") - 1:
                    raise ValueError("NCAA leaderboard season does not match basketball overview")
            else:
                if forecast_games > upcoming_games:
                    raise ValueError("football forecasts exceed upcoming games")
                if not isinstance(overview.get("ratings"), list) or not overview["ratings"]:
                    raise ValueError("football release has no team ratings")
        except ValueError as exc:
            errors.append(str(exc))
    report = {
        "checked_at": now.isoformat().replace("+00:00", "Z"),
        "sport": sport,
        "max_age_hours": max_age_hours,
        "ok": not errors,
        "releases": releases,
        "errors": errors,
    }
    if errors:
        raise ValueError(json.dumps(report, separators=(",", ":")))
    return report
