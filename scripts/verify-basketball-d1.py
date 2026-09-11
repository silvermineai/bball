"""Verify that the remote basketball D1 edition matches published artifacts.

The basketball publisher imports several independently generated SQL releases.
This gate runs after every sync and before deployment so a partial or stale
Cloudflare import cannot be mistaken for a successful publication.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")
NCAA_BOX_D1_DATABASE = os.getenv("NCAA_BOX_D1_DATABASE", "bball-ncaa-box-v1")


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
        # The D1 impact table retains every historical player-season row;
        # the frontend impact JSON is a current-player presentation slice.
        # Compare D1 against the local warehouse export so the gate validates
        # the complete publication rather than that UI slice.
        "bb_impact": int(
            sqlite3.connect(ROOT / ".local/basketball.sqlite3")
            .execute("SELECT COUNT(*) FROM bb_impact")
            .fetchone()[0]
        ),
        "bb_ncaa_rosters": datasets["ncaa_team_rosters"],
        "bb_ncaa_player_shooting": datasets["ncaa_shots"],
        "bb_unresolved": int(coverage["unresolved_rows"]),
    }
    local_path = ROOT / ".local/basketball.sqlite3"
    if not local_path.exists():
        raise SystemExit(f"Missing local basketball warehouse: {local_path}")
    with sqlite3.connect(local_path) as database:
        expected["bb_ncaa_player_box"] = int(database.execute(
            "SELECT COUNT(*) FROM bb_ncaa_player_box"
        ).fetchone()[0])
        expected["bb_ncaa_player_season"] = int(
            database.execute("SELECT COUNT(*) FROM bb_ncaa_player_season").fetchone()[0]
        )
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


def main() -> None:
    overview = json.loads(
        (ROOT / "frontend/public/data/basketball/overview.json").read_text()
    )
    expected = dataset_rows(overview)
    game_expected = {"bb_ncaa_player_box": expected.pop("bb_ncaa_player_box")}
    actual = remote_counts(list(expected), D1_DB_NAME)
    actual.update(remote_counts(list(game_expected), NCAA_BOX_D1_DATABASE))
    expected.update(game_expected)
    mismatches = [
        f"{table}: expected {expected[table]:,}, found {actual[table]:,}"
        for table in expected
        if actual[table] != expected[table]
    ]
    if mismatches:
        raise SystemExit("Basketball D1 coverage mismatch:\n" + "\n".join(mismatches))
    print(
        f"Basketball D1 coverage verified: {len(expected)} tables, "
        f"{sum(actual.values()):,} rows across the published edition "
        "(all retained NCAA game rows plus historical season summaries)."
    )


if __name__ == "__main__":
    main()
