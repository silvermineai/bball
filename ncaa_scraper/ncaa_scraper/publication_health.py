"""Freshness and structural checks for published sport releases."""

from __future__ import annotations

import json
import hashlib
import re
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


def _ncaa_individual_health(payload: dict) -> dict:
    """Require exact-ID assist supplements and the complete D1 box-derived field set."""
    box_fields = (
        "ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct",
        "threes_pg", "mpg", "ast_to", "pts", "reb", "ast", "stl", "blk",
        "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta",
    )
    supplements = payload.get("supplements")
    apg = supplements.get("apg") if isinstance(supplements, dict) else None
    ast = supplements.get("ast") if isinstance(supplements, dict) else None
    coverage = payload.get("coverage")
    divisions = coverage.get("divisions") if isinstance(coverage, dict) else None
    d1 = divisions.get("1") if isinstance(divisions, dict) else None
    source_hash = apg.get("source_sha256") if isinstance(apg, dict) else None
    values = apg.get("values") if isinstance(apg, dict) else None
    d1_values = d1.get("apg") if isinstance(d1, dict) else None
    ast_source_hash = ast.get("source_sha256") if isinstance(ast, dict) else None
    ast_values = ast.get("values") if isinstance(ast, dict) else None
    d1_ast_values = d1.get("ast") if isinstance(d1, dict) else None
    box = supplements.get("box_derived") if isinstance(supplements, dict) else None
    box_values = box.get("values") if isinstance(box, dict) else None
    box_source_hash = box.get("source_sha256") if isinstance(box, dict) else None
    if (
        not isinstance(apg, dict)
        or not isinstance(values, int)
        or isinstance(values, bool)
        or values <= 0
        or not isinstance(d1_values, int)
        or isinstance(d1_values, bool)
        or d1_values <= 0
        or not isinstance(apg.get("basis"), str)
        or not isinstance(source_hash, str)
        or not re.fullmatch(r"[a-f0-9]{64}", source_hash)
        or not isinstance(ast, dict)
        or not isinstance(ast_values, int)
        or isinstance(ast_values, bool)
        or ast_values <= 0
        or not isinstance(d1_ast_values, int)
        or isinstance(d1_ast_values, bool)
        or d1_ast_values <= 0
        or not isinstance(ast.get("basis"), str)
        or not isinstance(ast_source_hash, str)
        or not re.fullmatch(r"[a-f0-9]{64}", ast_source_hash)
        or not isinstance(box, dict)
        or not isinstance(box_values, dict)
        or any(
            not isinstance(box_values.get(field), int)
            or isinstance(box_values.get(field), bool)
            or box_values[field] <= 0
            or not isinstance(d1.get(field), int)
            or isinstance(d1.get(field), bool)
            or d1[field] <= 0
            for field in box_fields
        )
        or not isinstance(box.get("basis"), str)
        or not isinstance(box_source_hash, str)
        or not re.fullmatch(r"[a-f0-9]{64}", box_source_hash)
    ):
        raise ValueError("basketball/ncaa-individual.json has incomplete exact-ID box-derived supplements")
    return {
        "release": "basketball/ncaa-individual.json#apg-supplement",
        "supplemented_values": values,
        "division_i_values": d1_values,
        "supplemented_ast_values": ast_values,
        "division_i_ast_values": d1_ast_values,
        "box_derived_fields": len(box_fields),
        "source_sha256": source_hash,
    }


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
        fetched = entry.get("fetched_at")
        if fetched is not None:
            if not isinstance(fetched, str):
                raise ValueError(f"{relative} season {season} has an invalid fetched_at timestamp")
            timestamps.append(fetched)
        path = entry.get("path")
        if path is not None:
            if not isinstance(path, str) or not path.startswith("/data/"):
                raise ValueError(f"{relative} season {season} has an invalid derivative path")
            derivative = root / "frontend/public" / path.removeprefix("/")
            if not derivative.exists():
                raise ValueError(f"{relative} season {season} references missing derivative {path}")
        coverage = entry.get("coverage")
        if not isinstance(coverage, dict) and not isinstance(entry.get("source_rows"), int) and not isinstance(entry.get("rows"), int):
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


def _unresolved_coverage_health(
    root: Path,
    overview: dict,
) -> dict:
    """Validate the public identity-review summary against the active edition."""
    relative = "basketball/unresolved-coverage.json"
    payload = _read(root, str(Path("frontend/public/data") / relative))
    generated = payload.get("generated_at")
    overview_generated = overview.get("generated_at")
    if not isinstance(generated, str) or not isinstance(overview_generated, str):
        raise ValueError(f"{relative} has no generated_at timestamp")
    if generated != overview_generated:
        raise ValueError(f"{relative} does not match basketball overview edition")
    total = payload.get("total_rows")
    observed = payload.get("rows_with_observed_stats")
    rows = payload.get("rows")
    if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in (total, observed)):
        raise ValueError(f"{relative} has invalid totals")
    if observed > total or not isinstance(rows, list):
        raise ValueError(f"{relative} has invalid row coverage")
    seen: set[tuple[str, str]] = set()
    sum_total = 0
    sum_observed = 0
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"{relative} has a malformed breakdown row")
        dataset, reason = row.get("dataset"), row.get("reason")
        row_total, row_observed = row.get("rows"), row.get("rows_with_observed_stats")
        if not isinstance(dataset, str) or not dataset or not isinstance(reason, str) or not reason:
            raise ValueError(f"{relative} has an invalid breakdown identity")
        if (dataset, reason) in seen:
            raise ValueError(f"{relative} has duplicate breakdown rows")
        if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in (row_total, row_observed)) or row_observed > row_total:
            raise ValueError(f"{relative} has invalid breakdown counts")
        seen.add((dataset, reason))
        sum_total += row_total
        sum_observed += row_observed
    if sum_total != total or sum_observed != observed:
        raise ValueError(f"{relative} totals do not match its breakdown")
    return {"release": relative, "generated_at": generated, "groups": len(rows), "rows": total, "rows_with_observed_stats": observed}


def _roster_snapshot_health(root: Path) -> dict:
    """Validate the consecutive source roster editions used by recruiting views."""
    snapshots = {2025: "rosters-2025.json", 2026: "rosters-2026.json", 2027: "rosters.json"}
    counts = {}
    for season, filename in snapshots.items():
        relative = f"frontend/public/data/basketball/{filename}"
        payload = _read(root, relative)
        if payload.get("season") != season:
            raise ValueError(f"{relative} has season {payload.get('season')!r}; expected {season}")
        players, teams = payload.get("players"), payload.get("team_summaries")
        if not isinstance(players, list) or not isinstance(teams, list) or not players or not teams:
            raise ValueError(f"{relative} has no usable player or team roster rows")
        counts[str(season)] = {"players": len(players), "teams": len(teams)}
    return {"release": "basketball/roster-snapshots", "seasons": counts}


def _evaluation_health(root: Path) -> dict:
    """Verify the public basketball evaluation manifest and transition bundles."""
    directory = root / "frontend/public/data/basketball/evaluation"
    summary = _read(root, "frontend/public/data/basketball/evaluation/summary.json")
    manifest = _read(root, "frontend/public/data/basketball/evaluation/manifest.json")
    experiment_id = summary.get("id")
    if not isinstance(experiment_id, str) or not experiment_id:
        raise ValueError("basketball evaluation summary has no experiment id")
    if manifest.get("signature") != experiment_id:
        raise ValueError("basketball evaluation manifest does not match summary")
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError("basketball evaluation manifest has no files")
    for name, expected in files.items():
        if not isinstance(name, str) or not isinstance(expected, str):
            raise ValueError("basketball evaluation manifest has malformed file entry")
        path = directory / name
        if not path.exists():
            raise ValueError(f"basketball evaluation manifest references missing file: {name}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"basketball evaluation file hash mismatch: {name}")

    results = summary.get("season_results")
    if not isinstance(results, list) or [row.get("season") for row in results if isinstance(row, dict)] != [2024, 2025, 2026]:
        raise ValueError("basketball evaluation must publish 2024, 2025 and 2026 transitions")
    index = _read(root, "frontend/public/data/basketball/evaluation/transitions.json")
    if index.get("experiment_id") != experiment_id:
        raise ValueError("basketball transition index does not match summary")
    entries = index.get("transitions")
    if not isinstance(entries, list) or [entry.get("season") for entry in entries if isinstance(entry, dict)] != [2024, 2025, 2026]:
        raise ValueError("basketball transition index has incomplete seasons")
    for result, entry in zip(results, entries):
        if not isinstance(result, dict) or not isinstance(entry, dict):
            raise ValueError("basketball evaluation has malformed transition metadata")
        path_name = entry.get("path")
        if not isinstance(path_name, str) or not path_name.startswith("transition-"):
            raise ValueError("basketball transition index has an invalid evidence path")
        payload = _read(root, f"frontend/public/data/basketball/evaluation/{path_name}")
        transition = payload.get("transition")
        if payload.get("experiment_id") != experiment_id or not isinstance(transition, dict):
            raise ValueError(f"basketball transition evidence is not tied to the active experiment: {path_name}")
        games = transition.get("games")
        weekly_fits = transition.get("weekly_fits")
        if not isinstance(games, list) or not isinstance(weekly_fits, list):
            raise ValueError(f"basketball transition evidence is missing rows or fits: {path_name}")
        if len(games) != result.get("compared_games") or len(weekly_fits) != result.get("weekly_fits"):
            raise ValueError(f"basketball transition evidence counts do not match summary: {path_name}")
    return {
        "release": "basketball/evaluation/summary.json",
        "experiment_id": experiment_id,
        "transitions": len(entries),
        "files": len(files),
    }


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
                datasets = coverage.get("datasets")
                if isinstance(datasets, list):
                    dataset_keys = {
                        item.get("key")
                        for item in datasets
                        if isinstance(item, dict) and isinstance(item.get("key"), str)
                    }
                    required = {
                        "schedule",
                        "team_box",
                        "player_box",
                        "rosters",
                        "player_season",
                        "team_season",
                        "publisher_ratings",
                        "publisher_player_value",
                        "ncaa_lineups",
                        "player_core",
                        "ncaa_player_box",
                        "ncaa_team_rosters",
                        "ncaa_shots",
                    }
                    missing = sorted(required - dataset_keys)
                    if missing:
                        raise ValueError(
                            "basketball release is missing dataset layers: "
                            + ", ".join(missing)
                        )
                ncaa = _read(root, str(prefix / "ncaa-individual.json"))
                releases.append(
                    _season_snapshot(
                        "basketball/ncaa-individual.json",
                        ncaa,
                    )
                )
                if ncaa.get("season") != overview.get("season") - 1:
                    raise ValueError("NCAA leaderboard season does not match basketball overview")
                releases.append(_unresolved_coverage_health(root, overview))
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
                    "basketball/ncaa-player-box-catalog.json",
                ):
                    catalog = _read(root, str(Path("frontend/public/data") / relative))
                    releases.extend(_catalog_health(root, relative, catalog, now, max_age_hours))
                releases.append(_roster_snapshot_health(root))
                releases.append(_evaluation_health(root))
                releases.append(_ncaa_individual_health(ncaa))
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
