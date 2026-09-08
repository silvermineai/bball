"""Add an auditable breakdown of basketball rows withheld from identity joins."""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / ".local/basketball.sqlite3"
OVERVIEW = ROOT / "frontend/public/data/basketball/overview.json"
OUTPUT = ROOT / "frontend/public/data/basketball/unresolved-coverage.json"

# A row can be useful evidence even when the publisher omitted the identifier
# needed for a player/team join. Count source observations without publishing
# the raw unresolved payload in the public derivative.
OBSERVATION_FIELDS = {
    "player_box": (
        "minutes", "field_goals_made", "field_goals_attempted", "points",
        "rebounds", "assists", "steals", "blocks", "turnovers",
    ),
    "ncaa_player_box": (
        "mins", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta",
        "orb", "drb", "ast", "stl", "blk", "tov",
    ),
    "ncaa_shots": ("made", "point_value", "shot_x", "shot_y", "dist_ft"),
    "publisher_player_value": ("min", "box_bpm", "box_obpm", "box_dbpm"),
}


def populated(value: object) -> bool:
    return value is not None and value != ""


def build(conn: sqlite3.Connection) -> list[dict[str, object]]:
    grouped: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"rows": 0, "rows_with_observed_stats": 0}
    )
    cursor = conn.execute(
        "SELECT dataset,reason,source_json FROM bb_unresolved ORDER BY dataset,reason,row_index"
    )
    for dataset, reason, source_json in cursor:
        entry = grouped[(dataset, reason)]
        entry["rows"] += 1
        fields = OBSERVATION_FIELDS.get(dataset, ())
        try:
            source = json.loads(source_json)
        except (TypeError, ValueError):
            source = {}
        if isinstance(source, dict) and any(populated(source.get(field)) for field in fields):
            entry["rows_with_observed_stats"] += 1
    return [
        {"dataset": dataset, "reason": reason, **values}
        for (dataset, reason), values in sorted(grouped.items())
    ]


def main() -> None:
    with sqlite3.connect(DB) as conn:
        breakdown = build(conn)
    overview = json.loads(OVERVIEW.read_text())
    payload = {
        "schema_version": 1,
        "generated_at": overview.get("generated_at"),
        "total_rows": sum(int(row["rows"]) for row in breakdown),
        "rows_with_observed_stats": sum(int(row["rows_with_observed_stats"]) for row in breakdown),
        "rows": breakdown,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
