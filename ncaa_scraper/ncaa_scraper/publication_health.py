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


def _catalog_health(
    root: Path,
    relative: str,
    payload: dict,
    now: datetime,
    max_age_hours: float,
) -> list[dict]:
    """Validate a season catalog and every compact derivative it references."""
    seasons = payload.get("seasons")
    if not isinstance(seasons, list) or not seasons:
        raise ValueError(f"{relative} has no season entries")
    timestamps: list[str] = []
    top_generated = payload.get("generated_at")
    if top_generated is not None:
        if not isinstance(top_generated, str):
            raise ValueError(f"{relative} has an invalid generated_at timestamp")
        timestamps.append(top_generated)
    for entry in seasons:
        if not isinstance(entry, dict):
            raise ValueError(f"{relative} has a malformed season entry")
        season = entry.get("season")
        if not isinstance(season, int) or isinstance(season, bool):
            raise ValueError(f"{relative} has an invalid season entry")
        generated = entry.get("generated_at")
        if generated is not None:
            if not isinstance(generated, str):
                raise ValueError(f"{relative} season {season} has an invalid timestamp")
            timestamps.append(generated)
        path = entry.get("path")
        if path is not None:
            if not isinstance(path, str) or not path.startswith("/data/"):
                raise ValueError(f"{relative} season {season} has an invalid derivative path")
            derivative = root / "frontend/public" / path.removeprefix("/")
            if not derivative.exists():
                raise ValueError(f"{relative} season {season} references missing derivative {path}")
        coverage = entry.get("coverage")
        if not isinstance(coverage, dict) and not isinstance(entry.get("source_rows"), int):
            raise ValueError(f"{relative} season {season} has no coverage object")
    if not timestamps:
        raise ValueError(f"{relative} has no freshness timestamp")
    # Check each timestamp so one old season cannot hide behind a fresh catalog entry.
    checked = [_freshness(f"{relative} season", {"generated_at": value}, now, max_age_hours) for value in timestamps]
    latest = max(checked, key=lambda value: value["generated_at"])
    return [{"release": relative, "generated_at": latest["generated_at"], "catalog_seasons": len(seasons), "age_hours": latest["age_hours"]}]


def _player_catalog_health(
    root: Path,
    now: datetime,
    max_age_hours: float,
) -> dict:
    """Validate the long football player archive separately from the model snapshot."""
    relative = "football/player-catalog.json"
    payload = _read(root, str(Path("frontend/public/data") / relative))
    seasons = payload.get("seasons")
    if not isinstance(seasons, list) or not seasons:
        raise ValueError(f"{relative} has no season entries")
    years = []
    rows = 0
    for entry in seasons:
        if not isinstance(entry, dict) or not isinstance(entry.get("season"), int):
            raise ValueError(f"{relative} has a malformed season entry")
        years.append(entry["season"])
        box_rows = entry.get("box_rows")
        if not isinstance(box_rows, int) or isinstance(box_rows, bool) or box_rows < 0:
            raise ValueError(f"{relative} has invalid box_rows")
        rows += box_rows
    if min(years) > 2018 or max(years) < 2026 or rows <= 0:
        raise ValueError(f"{relative} does not cover the published 2018–2026 archive")
    retrieved = payload.get("latest_source_retrieved_at")
    if not isinstance(retrieved, str):
        raise ValueError(f"{relative} has no latest_source_retrieved_at timestamp")
    checked = _freshness(relative, {"generated_at": retrieved}, now, max_age_hours)
    return {**checked, "archive_seasons": len(seasons), "box_rows": rows}


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
                releases.append(_player_catalog_health(root, now, max_age_hours))
            if selected == "basketball":
                for relative in (
                    "basketball/history/index.json",
                    "basketball/pbp-catalog.json",
                    "basketball/matchup-stints.json",
                    "basketball/ncaa-team-box.json",
                    "basketball/impact-within-team.json",
                    "basketball/shooting-catalog.json",
                ):
                    catalog = _read(root, str(Path("frontend/public/data") / relative))
                    releases.extend(_catalog_health(root, relative, catalog, now, max_age_hours))
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
