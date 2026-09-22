"""Sync the current basketball model and a newly added season into D1.

The main basketball SQL export intentionally omits the large model table. This
small, idempotent release keeps the latest model and forecast rows in D1 and
also supports adding a cached historical season without replaying every other
research table. SQL is split below D1's request and statement limits.

Scheduled maintenance sets ``BASKETBALL_D1_INCREMENTAL=1``. That keeps the
model and current forecast rows fresh while leaving historical player and
impact partitions in D1; unset it for an empty-database bootstrap.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / ".local/basketball.sqlite3"
OUT = ROOT / ".local/basketball-core.sql"
PY = sys.executable


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def row_statements(conn, table, season):
    columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
    if not columns:
        raise ValueError(f"Unknown table: {table}")
    rows = conn.execute(
        f"SELECT {','.join(columns)} FROM {table} WHERE season=?", (season,)
    )
    prefix = f"INSERT OR REPLACE INTO {table} ({','.join(columns)}) VALUES ("
    for row in rows:
        yield prefix + ",".join(quote(value) for value in row) + ");\n"


def split_sql(statements, path, max_bytes=7_500_000):
    batches = []
    current = []
    size = 0

    def flush():
        nonlocal current, size
        if not current:
            return
        target = path if not batches else path.with_name(
            f"{path.stem}-{len(batches):04d}{path.suffix}"
        )
        target.write_text("".join(current))
        batches.append(target)
        current, size = [], 0

    for statement in statements:
        encoded = len(statement.encode())
        if encoded >= 100_000:
            raise ValueError("A D1 statement exceeds the 100 KB limit")
        if current and size + encoded > max_bytes:
            flush()
        current.append(statement)
        size += encoded
    flush()
    return batches


def forecast_records(overview):
    """Yield every available model estimate, including cold-start rows."""
    for game in overview["upcoming"]:
        prediction = game.get("prediction") or game.get("fallback_prediction")
        if prediction is not None:
            yield game, prediction


FACTOR_KEYS = ("efg", "tov", "orb", "ftr")
FACTOR_VALUE_KEYS = ("home_offense", "home_defense", "away_offense", "away_defense")


def forecast_payload(game, prediction):
    """Persist the prediction with its exact-edition matchup context.

    The overview is the immutable model edition used to create the score. The
    D1 sync must carry that edition's four-factor context with the forecast
    row; otherwise the API has to fall back to a stale static overview and can
    expose context from a different model vintage. A non-null malformed
    factor payload fails the publication rather than being silently dropped.
    """
    if not isinstance(prediction, dict):
        raise ValueError("Forecast prediction must be an object")
    payload = dict(prediction)
    factors = game.get("matchup_factors")
    if factors is None:
        return payload
    if not isinstance(factors, dict):
        raise ValueError(f"Forecast {game.get('id')} has invalid matchup factors")
    season = factors.get("season")
    factor_values = factors.get("factors")
    edges = factors.get("edges")
    if (
        not isinstance(season, int)
        or isinstance(season, bool)
        or not isinstance(factor_values, dict)
        or not isinstance(edges, dict)
        or set(factor_values) != set(FACTOR_KEYS)
        or set(edges) != set(FACTOR_KEYS)
    ):
        raise ValueError(f"Forecast {game.get('id')} has invalid matchup factors")
    for key in FACTOR_KEYS:
        values = factor_values[key]
        edge = edges[key]
        if (
            not isinstance(values, dict)
            or set(values) != set(FACTOR_VALUE_KEYS)
            or not isinstance(edge, (int, float))
            or isinstance(edge, bool)
            or not -1 <= edge <= 1
            or any(
                not isinstance(values[field], (int, float))
                or isinstance(values[field], bool)
                or not 0 <= values[field] <= 1
                for field in FACTOR_VALUE_KEYS
            )
        ):
            raise ValueError(f"Forecast {game.get('id')} has invalid matchup factors")
    payload["matchup_factors"] = factors
    return payload


def published_model_metadata(model, expected_forecasts, *, total_interval=None):
    """Return the public model contract used to validate a complete D1 edition."""
    metadata = {
        key: model[key]
        for key in (
            "version",
            "target_season",
            "cutoff",
            "training_games",
            "training_seasons",
            "settings",
            "calibration",
            "evaluation",
        )
        if key in model
    }
    metadata["expected_forecasts"] = expected_forecasts
    if total_interval is None:
        total_interval = total_interval_contract(model, [])
    metadata["intervals"] = {"total": total_interval}
    return metadata


def total_interval_contract(model, forecast_rows):
    """Validate total uncertainty before a model receipt can enter D1.

    Older editions are retained for reproducibility and are explicitly marked
    unavailable. Once an edition publishes a held-out total calibration, a
    partial row refresh must fail before any SQL is emitted; otherwise the
    catalog could claim calibrated totals while the live board silently mixes
    rows with and without their intervals.
    """
    calibration = model.get("calibration") if isinstance(model, dict) else None
    width = calibration.get("total_half_width") if isinstance(calibration, dict) else None
    if not isinstance(width, (int, float)) or isinstance(width, bool) or not math.isfinite(width) or width <= 0:
        return {
            "status": "unavailable",
            "reason": "This model edition predates independent held-out total calibration.",
            "forecast_rows": 0,
        }
    missing = []
    malformed = []
    for game, prediction in forecast_rows:
        game_id = str(game.get("id") or "")
        if not isinstance(prediction, dict):
            missing.append(game_id)
            continue
        values = [prediction.get(key) for key in ("total", "total_low", "total_high")]
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in values):
            missing.append(game_id)
            continue
        total, low, high = values
        if low > high or total < low or total > high:
            malformed.append(game_id)
    if missing:
        raise ValueError(
            "Calibrated total interval is missing from forecast rows: "
            + ", ".join(missing[:5])
            + (" …" if len(missing) > 5 else "")
        )
    if malformed:
        raise ValueError(
            "Calibrated total interval is malformed for forecast rows: "
            + ", ".join(malformed[:5])
            + (" …" if len(malformed) > 5 else "")
        )
    return {
        "status": "calibrated",
        "method": "held_out_absolute_total_error_quantile_80",
        "calibration_half_width": width,
        "forecast_rows": len(forecast_rows),
    }


def roster_publication(artifact, model_id, forecast_game_ids):
    """Validate and split a roster artifact into D1-sized edition records."""
    if not isinstance(artifact, dict):
        raise ValueError("Roster artifact must be an object")
    if artifact.get("primary_model_id") != model_id:
        raise ValueError("Roster artifact does not match the published primary model")
    generated_at = artifact.get("generated_at")
    if not isinstance(generated_at, str) or not generated_at:
        raise ValueError("Roster artifact is missing its generation time")
    values = artifact.get("scenarios")
    if not isinstance(values, list):
        raise ValueError("Roster artifact scenarios must be a list")
    scenarios = []
    seen = set()
    for value in values:
        if not isinstance(value, dict):
            raise ValueError("Roster scenario must be an object")
        game_id = str(value.get("game_id") or "")
        if not game_id or game_id in seen:
            raise ValueError("Roster scenarios require unique game IDs")
        if game_id not in forecast_game_ids:
            raise ValueError(f"Roster scenario {game_id} is outside the forecast slate")
        if value.get("primary_model_id") != model_id:
            raise ValueError(f"Roster scenario {game_id} has a mismatched model ID")
        home_id = str(value.get("home_id") or "")
        away_id = str(value.get("away_id") or "")
        if not home_id or not away_id:
            raise ValueError(f"Roster scenario {game_id} is missing participants")
        seen.add(game_id)
        scenarios.append(value)
    coverage = artifact.get("coverage")
    if (
        isinstance(coverage, dict)
        and coverage.get("scenario_games") is not None
        and coverage.get("scenario_games") != len(scenarios)
    ):
        raise ValueError("Roster scenario coverage does not match the artifact rows")
    metadata = {
        key: value
        for key, value in artifact.items()
        if key not in {"teams", "scenarios"}
    }
    return metadata, scenarios


def publication_manifest(
    *,
    model_id,
    season,
    batches,
    forecast_rows,
    roster_scenarios,
    overview,
    overview_path,
    roster_artifact,
    roster_path,
):
    """Describe the recoverable compact publication bundle by content hash."""
    return {
        "model_id": model_id,
        "season": season,
        "batches": [path.name for path in batches],
        "forecast_rows": len(forecast_rows),
        "roster_scenario_rows": len(roster_scenarios),
        "overview_generated_at": overview.get("generated_at"),
        "overview_sha256": hashlib.sha256(overview_path.read_bytes()).hexdigest(),
        "roster_generated_at": roster_artifact.get("generated_at"),
        "roster_sha256": hashlib.sha256(roster_path.read_bytes()).hexdigest(),
    }


def build(season=2023):
    overview_path = ROOT / "frontend/public/data/basketball/overview.json"
    roster_path = ROOT / "frontend/public/data/basketball/roster-model.json"
    overview = json.loads(overview_path.read_text())
    model = overview["model"]
    roster_artifact = json.loads(roster_path.read_text())
    incremental = os.getenv("BASKETBALL_D1_INCREMENTAL") == "1"
    if not model.get("id", "").startswith("basketball-efficiency-v2-"):
        raise ValueError("Unexpected basketball model ID")
    # A D1 resume can be started after the large local warehouse was cleaned
    # up.  The published overview is still a verified, hash-checked model
    # edition, so keep the compact model/forecast release recoverable without
    # pretending that historical identity tables are available locally.
    conn = None
    if DB.exists() and DB.stat().st_size > 0:
        try:
            conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        except sqlite3.DatabaseError:
            conn = None
    statements = []
    forecast_rows = list(forecast_records(overview))
    total_interval = total_interval_contract(model, forecast_rows)
    roster_metadata, roster_scenarios = roster_publication(
        roster_artifact,
        model["id"],
        {str(game["id"]) for game, _ in forecast_rows},
    )
    # Models are queried only for identity and creation time by the public API.
    # Keep a compact, useful metadata record in D1 while the complete fitted
    # artifact remains in the static, hash-checked edition.
    model_metadata = published_model_metadata(
        model,
        len(forecast_rows),
        total_interval=total_interval,
    )
    # A repeated publication can reuse the same model ID when only source
    # metadata changed. Remove that edition's old slate before rebuilding it so
    # D1 cannot retain a forecast for a game that left the current schedule.
    statements.append(
        "DELETE FROM bb_forecasts WHERE model_id=" + quote(model["id"]) + ";\n"
    )
    statements.append(
        "DELETE FROM bb_roster_scenarios WHERE primary_model_id="
        + quote(model["id"])
        + ";\n"
    )
    statements.append(
        "DELETE FROM bb_roster_models WHERE primary_model_id="
        + quote(model["id"])
        + ";\n"
    )
    for game, prediction in forecast_rows:
        # Primary and cold-start estimates are both Silvermine model outputs.
        # Keep the fallback rows in D1 too, so the live forecast catalog covers
        # every scheduled game instead of silently dropping unmodeled teams.
        statements.append(
            "INSERT OR REPLACE INTO bb_forecasts (game_id,model_id,created_at,prediction_json) VALUES ("
            + ",".join(
                quote(v)
                for v in (
                    game["id"],
                    model["id"],
                    overview["generated_at"],
                    json.dumps(forecast_payload(game, prediction), separators=(",", ":")),
                )
            )
            + ");\n"
        )
    statements.append(
        "INSERT OR REPLACE INTO bb_roster_models "
        "(primary_model_id,created_at,metadata_json) VALUES ("
        + ",".join(
            quote(value)
            for value in (
                model["id"],
                roster_artifact["generated_at"],
                json.dumps(roster_metadata, separators=(",", ":")),
            )
        )
        + ");\n"
    )
    for scenario in roster_scenarios:
        statements.append(
            "INSERT OR REPLACE INTO bb_roster_scenarios "
            "(primary_model_id,game_id,home_id,away_id,lens_json) VALUES ("
            + ",".join(
                quote(value)
                for value in (
                    model["id"],
                    scenario["game_id"],
                    scenario["home_id"],
                    scenario["away_id"],
                    json.dumps(scenario, separators=(",", ":")),
                )
            )
            + ");\n"
        )
    # Register the edition only after all forecast statements. D1 imports can
    # be split across requests, so publishing this receipt last prevents an
    # unregistered partial batch from becoming the live `latest` model.
    statements.append(
        "INSERT OR REPLACE INTO bb_models (id,created_at,artifact_json) VALUES ("
        + ",".join(
            quote(v)
            for v in (
                model["id"],
                overview["generated_at"],
                json.dumps(model_metadata, separators=(",", ":")),
            )
        )
        + ");\n"
    )

    # Add the 2022–23 ESPN-derived season and its compact identity context.
    # Full publishers may replay these rows; INSERT OR REPLACE keeps either
    # path safe and preserves all existing editions.
    if not incremental and conn is not None:
        for table in (
            "bb_sources",
            "bb_games",
            "bb_team_box",
            "bb_player_box",
            "bb_participation",
            "bb_team_season",
            "bb_publisher_ratings",
            "bb_player_value",
            "bb_player_crosswalk",
        ):
            try:
                statements.extend(row_statements(conn, table, season))
            except sqlite3.OperationalError:
                # Optional tables are absent in small development fixtures.
                continue
    # League-wide RAPM is a compact historical board (2011–26). Publish all
    # season partitions through this core sync so the rankings API can answer
    # historical season queries without replaying the multi-gigabyte player
    # game archive.
    if not incremental and conn is not None:
        try:
            for impact_season in range(2011, 2027):
                statements.extend(row_statements(conn, "bb_impact", impact_season))
                statements.extend(
                    row_statements(conn, "bb_sources", impact_season)
                )
        except sqlite3.OperationalError:
            pass
    # The main basketball SQL release clears the season-partitioned profile
    # table before import. Re-publish every season here so a refresh cannot
    # leave a historical season sparse when the compact core release is
    # synced after the large edition.
    if not incremental and conn is not None:
        try:
            for core_season in range(2003, 2027):
                statements.extend(row_statements(conn, "bb_player_core", core_season))
        except sqlite3.OperationalError:
            pass
    # Player identities are global, so include the current compact dictionary
    # needed by player-box lookups after adding a historical season.
    if conn is not None:
        try:
            columns = [row[1] for row in conn.execute("PRAGMA table_info(bb_players)")]
            if columns:
                for row in conn.execute(f"SELECT {','.join(columns)} FROM bb_players"):
                    statements.append(
                        f"INSERT OR REPLACE INTO bb_players ({','.join(columns)}) VALUES ("
                        + ",".join(quote(value) for value in row)
                        + ");\n"
                    )
        except sqlite3.OperationalError:
            # Small development fixtures may contain only the model inputs.
            pass
        conn.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    for old in OUT.parent.glob(f"{OUT.stem}*{OUT.suffix}"):
        old.unlink()
    batches = split_sql(statements, OUT)
    manifest = publication_manifest(
        model_id=model["id"],
        season=season,
        batches=batches,
        forecast_rows=forecast_rows,
        roster_scenarios=roster_scenarios,
        overview=overview,
        overview_path=overview_path,
        roster_artifact=roster_artifact,
        roster_path=roster_path,
    )
    OUT.with_name("basketball-core-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    return batches, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2023)
    parser.add_argument("--remote", action="store_true")
    args = parser.parse_args()
    batches, manifest = build(args.season)
    if args.remote:
        for index, batch in enumerate(batches, 1):
            subprocess.run(
                [
                    PY,
                    str(ROOT / "scripts/cloudflare.py"),
                    "d1",
                    "execute",
                    D1_DB_NAME,
                    "--remote",
                    "--yes",
                    "--file",
                    os.path.relpath(batch, ROOT / "worker"),
                ],
                check=True,
                cwd=ROOT,
            )
            print(f"Imported basketball core batch {index}/{len(batches)}", flush=True)
    print(
        f"Prepared {len(batches)} basketball core batches for model {manifest['model_id']}"
    )


if __name__ == "__main__":
    main()
