"""Verify that the remote basketball D1 edition matches published artifacts.

The basketball publisher imports several independently generated SQL releases.
This gate runs after every sync and before deployment so a partial or stale
Cloudflare import cannot be mistaken for a successful publication.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")
NCAA_BOX_D1_DATABASE = os.getenv("NCAA_BOX_D1_DATABASE", "bball-ncaa-box-v1")
MODEL_ID_PATTERN = re.compile(r"basketball-efficiency-v2-[0-9a-f]{12}")


def dataset_rows(overview: dict) -> dict[str, int]:
    coverage = overview["coverage"]
    datasets = {row["key"]: int(row["rows"]) for row in coverage["datasets"]}
    expected = {
        "bb_games": int(coverage["schedule_records"]),
        "bb_team_box": datasets["team_box"],
        "bb_player_box": int(coverage["player_box_rows"]),
        "bb_rosters": datasets["rosters"],
        "bb_player_season": datasets["player_season"],
        "bb_team_season": datasets["team_season"],
        "bb_publisher_ratings": datasets["publisher_ratings"],
        "bb_player_value": datasets["publisher_player_value"],
        "bb_lineups": datasets["ncaa_lineups"],
        "bb_player_core": datasets["player_core"],
        # The D1 impact table retains every historical player-season row. The
        # complete count is in the coverage catalog; a local rebuilt warehouse
        # may refine it, but is not required for an incremental verification.
        "bb_impact": datasets["ncaa_rapm"],
        "bb_ncaa_rosters": datasets["ncaa_team_rosters"],
        "bb_ncaa_player_shooting": datasets["ncaa_shots"],
        "bb_ncaa_player_box": datasets["ncaa_player_box"],
        "bb_ncaa_player_season": datasets["ncaa_player_season"],
        "bb_ncaa_game_rosters": datasets["ncaa_game_rosters"],
        "bb_ncaa_officials": datasets["ncaa_officials"],
        # The incremental main export retains unresolved roster rows only for
        # the newest two context seasons; older roster context (and its
        # unresolved records) is published in the dedicated NCAA context D1.
        "bb_unresolved": int(coverage["unresolved_rows"]),
    }
    # The published overview is the contract for the remote edition. A local
    # SQLite file may be an incremental import, an older rebuild, or a partial
    # maintenance artifact; using its row counts here can make a correct D1
    # release fail verification (or let a stale count pass). Keep those local
    # files available for diagnostics, but never replace the content-addressed
    # publication counts with them.
    return expected


def remote_counts(tables: list[str], database_name: str) -> dict[str, int]:
    # Table names come only from the constant map above. Scalar subqueries keep
    # this to one D1 request, avoiding a race between individual count calls.
    command = "SELECT " + ", ".join(
        f"(SELECT COUNT(*) FROM {table}) AS {table}" for table in tables
    )
    result = subprocess.run(
        [
            PY,
            "scripts/cloudflare.py",
            "d1",
            "execute",
            database_name,
            "--remote",
            "--command",
            command,
            "--json",
        ],
        cwd=ROOT,
        env=ENV,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        print(result.stderr or result.stdout, file=sys.stderr, end="")
        raise SystemExit("Remote basketball D1 coverage query failed")
    try:
        payload = json.loads(result.stdout)
        row = payload[0]["results"][0]
        return {table: int(row[table]) for table in tables}
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit("Could not parse the remote basketball D1 coverage response") from exc


def current_edition_expectation(overview: dict, roster: dict) -> dict[str, int | str]:
    """Build the exact model/roster contract that D1 must satisfy.

    This intentionally derives counts from the generated artifacts rather than
    from D1 metadata. A partial import therefore cannot validate itself.
    """
    model = overview.get("model")
    model_id = model.get("id") if isinstance(model, dict) else None
    if not isinstance(model_id, str) or not MODEL_ID_PATTERN.fullmatch(model_id):
        raise ValueError("Basketball overview has an invalid model ID")
    upcoming = overview.get("upcoming")
    if not isinstance(upcoming, list):
        raise ValueError("Basketball overview has no upcoming slate")
    forecast_game_ids = {
        str(game.get("id"))
        for game in upcoming
        if isinstance(game, dict)
        and (game.get("prediction") is not None or game.get("fallback_prediction") is not None)
    }
    if not forecast_game_ids or "None" in forecast_game_ids:
        raise ValueError("Basketball overview has malformed forecast rows")
    if roster.get("primary_model_id") != model_id:
        raise ValueError("Roster challenger does not match the overview model edition")
    scenarios = roster.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("Roster challenger has no scenarios")
    scenario_ids = []
    for scenario in scenarios:
        if not isinstance(scenario, dict):
            raise ValueError("Roster challenger has a malformed scenario")
        game_id = str(scenario.get("game_id") or "")
        if (
            not game_id
            or game_id not in forecast_game_ids
            or scenario.get("primary_model_id") != model_id
        ):
            raise ValueError("Roster challenger has a mismatched scenario")
        scenario_ids.append(game_id)
    if len(set(scenario_ids)) != len(scenario_ids):
        raise ValueError("Roster challenger has duplicate scenario IDs")
    coverage = roster.get("coverage")
    if not isinstance(coverage, dict) or coverage.get("scenario_games") != len(scenario_ids):
        raise ValueError("Roster challenger coverage does not match its scenarios")
    return {
        "model_id": model_id,
        "forecasts": len(forecast_game_ids),
        "roster_scenarios": len(scenario_ids),
    }


def remote_current_edition(model_id: str) -> dict[str, int | str | None]:
    """Read the current edition atomically from D1 after all import batches."""
    if not MODEL_ID_PATTERN.fullmatch(model_id):
        raise ValueError("Refusing to query an invalid basketball model ID")
    quoted = "'" + model_id + "'"
    command = "SELECT " + ", ".join((
        f"(SELECT COUNT(*) FROM bb_models WHERE id={quoted}) AS models",
        f"(SELECT COUNT(*) FROM bb_forecasts WHERE model_id={quoted}) AS forecasts",
        f"(SELECT json_extract(artifact_json,'$.expected_forecasts') FROM bb_models WHERE id={quoted}) AS expected_forecasts",
        f"(SELECT COUNT(*) FROM bb_roster_models WHERE primary_model_id={quoted}) AS roster_models",
        f"(SELECT COUNT(*) FROM bb_roster_scenarios WHERE primary_model_id={quoted}) AS roster_scenarios",
        f"(SELECT json_extract(metadata_json,'$.primary_model_id') FROM bb_roster_models WHERE primary_model_id={quoted}) AS roster_primary_model_id",
        f"(SELECT COUNT(*) FROM bb_roster_scenarios WHERE primary_model_id={quoted} AND json_extract(lens_json,'$.primary_model_id') IS NOT {quoted}) AS mismatched_roster_scenarios",
    ))
    result = subprocess.run(
        [
            PY,
            "scripts/cloudflare.py",
            "d1",
            "execute",
            D1_DB_NAME,
            "--remote",
            "--command",
            command,
            "--json",
        ],
        cwd=ROOT,
        env=ENV,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        print(result.stderr or result.stdout, file=sys.stderr, end="")
        raise SystemExit("Remote basketball D1 edition query failed")
    try:
        return json.loads(result.stdout)[0]["results"][0]
    except (IndexError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise SystemExit("Could not parse the remote basketball D1 edition response") from exc


def validate_current_edition(
    expected: dict[str, int | str], actual: dict[str, int | str | None]
) -> None:
    """Reject a partial or cross-edition forecast/roster publication."""
    required = {
        "models": 1,
        "forecasts": expected["forecasts"],
        "expected_forecasts": expected["forecasts"],
        "roster_models": 1,
        "roster_scenarios": expected["roster_scenarios"],
        "roster_primary_model_id": expected["model_id"],
        "mismatched_roster_scenarios": 0,
    }
    mismatches = [
        f"{field}: expected {value}, found {actual.get(field)}"
        for field, value in required.items()
        if actual.get(field) != value
    ]
    if mismatches:
        raise ValueError("Basketball D1 current edition mismatch:\n" + "\n".join(mismatches))


def validate_unresolved_ledger(actual: int, source_ceiling: int | None) -> None:
    """Validate the deduplicated unresolved ledger against its source bound."""
    if source_ceiling is None:
        return
    if not (0 < actual <= source_ceiling):
        raise ValueError(
            "Basketball D1 unresolved ledger mismatch: "
            f"expected a positive deduplicated count <= {source_ceiling:,}, "
            f"found {actual:,}"
        )


def main() -> None:
    overview = json.loads(
        (ROOT / "frontend/public/data/basketball/overview.json").read_text()
    )
    roster = json.loads(
        (ROOT / "frontend/public/data/basketball/roster-model.json").read_text()
    )
    edition = current_edition_expectation(overview, roster)
    expected = dataset_rows(overview)
    # ``bb_unresolved`` is an audit ledger whose INSERT OR IGNORE import can
    # deduplicate rows. Its published source count is therefore a ceiling,
    # rather than an exact remote row-count contract.
    unresolved_ceiling = expected.pop("bb_unresolved", None)
    game_expected = {"bb_ncaa_player_box": expected.pop("bb_ncaa_player_box")}
    game_expected.update({key: expected.pop(key) for key in ("bb_ncaa_game_rosters", "bb_ncaa_officials")})
    actual = remote_counts(list(expected), D1_DB_NAME)
    actual.update(remote_counts(list(game_expected), NCAA_BOX_D1_DATABASE))
    unresolved_actual = remote_counts(["bb_unresolved"], D1_DB_NAME)["bb_unresolved"]
    expected.update(game_expected)
    mismatches = [
        f"{table}: expected {expected[table]:,}, found {actual[table]:,}"
        for table in expected
        if actual[table] != expected[table]
    ]
    if mismatches:
        raise SystemExit("Basketball D1 coverage mismatch:\n" + "\n".join(mismatches))
    try:
        validate_unresolved_ledger(unresolved_actual, unresolved_ceiling)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    try:
        validate_current_edition(
            edition, remote_current_edition(str(edition["model_id"]))
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(
        f"Basketball D1 coverage verified: {len(expected)} tables, "
        f"{sum(actual.values()):,} rows across the published edition "
        "(all retained NCAA game rows plus historical season summaries); "
        f"unresolved ledger {unresolved_actual:,} rows (source ceiling {unresolved_ceiling:,}); "
        f"model {edition['model_id']} has {edition['forecasts']:,} forecasts and "
        f"{edition['roster_scenarios']:,} matching roster scenarios."
    )


if __name__ == "__main__":
    main()
