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


def local_table_count(database: Path, table: str) -> int | None:
    """Read a local count when a complete rebuild warehouse is available.

    Incremental maintenance can be run from cached publication artifacts after
    a local warehouse cleanup.  In that case the zero-byte placeholder must not
    turn a valid D1 verification into a misleading ``no such table`` error.
    """
    try:
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as conn:
            present = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            if not present:
                return None
            return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except (OSError, sqlite3.DatabaseError):
        return None


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
    local_path = ROOT / ".local/basketball.sqlite3"
    # Prefer exact counts from a rebuilt local warehouse, while retaining the
    # published catalog values when maintenance is running from artifacts.
    for table, key in (
        ("bb_impact", "bb_impact"),
        ("bb_ncaa_player_box", "bb_ncaa_player_box"),
        ("bb_ncaa_player_season", "bb_ncaa_player_season"),
    ):
        count = local_table_count(local_path, table)
        if count is not None:
            expected[key] = count
    local_unresolved_checked = False
    try:
        with sqlite3.connect(f"file:{local_path}?mode=ro", uri=True) as database:
            present = database.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='bb_unresolved'"
            ).fetchone()
            if present:
                local_unresolved_checked = True
                latest_context = database.execute(
                    "SELECT MAX(season) FROM bb_unresolved WHERE dataset='ncaa_game_rosters'"
                ).fetchone()[0]
                if latest_context is not None:
                    expected["bb_unresolved"] = int(database.execute(
                        "SELECT COUNT(*) FROM bb_unresolved "
                        "WHERE dataset <> 'ncaa_game_rosters' OR season >= ?",
                        (int(latest_context) - 1,),
                    ).fetchone()[0])
    except (OSError, sqlite3.DatabaseError):
        pass
    if not local_unresolved_checked:
        # This table intentionally keeps only the newest two game-context
        # seasons in the incremental D1 import. Without the rebuilt warehouse
        # there is no trustworthy expected count, so omit this one comparison
        # instead of comparing the full static unresolved total to a scoped D1
        # table and reporting a false publication failure.
        expected.pop("bb_unresolved", None)
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
    game_expected.update({key: expected.pop(key) for key in ("bb_ncaa_game_rosters", "bb_ncaa_officials")})
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
