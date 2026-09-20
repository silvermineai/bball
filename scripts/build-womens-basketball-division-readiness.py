"""Build a fail-closed readiness contract for women's basketball divisions.

The retained women’s bulk release is source-native but does not publish a
Division II/III label or complete non-Division-I player/team tables.  This
artifact records that fact, along with the small number of scheduled games
flagged by the source as non-Division-I, so the UI can show useful evidence
without presenting those games as D2 or D3 rows.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EDITION = ROOT / "frontend/public/data/basketball/womens-edition.json"
SCHEDULE = ROOT / ".local/womens-basketball/wbb_schedule_2027.parquet"
OUT = ROOT / "frontend/public/data/basketball/womens-division-readiness.json"


def build_readiness(edition: dict[str, Any], schedule_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Return a division contract from observed fields only.

    ``away_non_div1_team`` is a source flag, not a D2/D3 classification.  It
    is retained as an auditable signal and deliberately never counted under
    either division.
    """
    flagged = []
    for row in schedule_rows:
        if row.get("away_non_div1_team") is not True:
            continue
        flagged.append(
            {
                "game_id": str(row.get("game_id") or row.get("id") or ""),
                "date": row.get("date") or row.get("start_date"),
                "home": row.get("home_display_name") or row.get("home_name"),
                "away": row.get("away_display_name") or row.get("away_name"),
                "source_flag": "away_non_div1_team",
            }
        )
    flagged.sort(key=lambda row: (str(row.get("date") or ""), row["game_id"]))
    coverage = edition.get("coverage") or {}
    receipts = edition.get("receipts") or {}
    source = {
        "release": "SportsDataverse women’s college basketball bulk release",
        "schedule_receipt": receipts.get("schedule") or {},
        "observed_season": edition.get("observed_player_season"),
        "target_season": edition.get("season"),
    }
    return {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "generated_at": edition.get("generated_at") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": source,
        "published": {
            "division": "1",
            "status": "published",
            "player_rows": int(coverage.get("players") or 0),
            "team_rows": int(coverage.get("team_stats_teams") or 0),
            "upcoming_games": int(coverage.get("upcoming_games") or 0),
        },
        "divisions": {
            "2": {
                "status": "unavailable",
                "rows": 0,
                "reason": "The retained release has no complete Division II player/team tables or explicit D2 label.",
            },
            "3": {
                "status": "unavailable",
                "rows": 0,
                "reason": "The retained release has no complete Division III player/team tables or explicit D3 label.",
            },
        },
        "non_division_one_schedule_signals": {
            "rows": len(flagged),
            "classification": "unresolved_non_d1",
            "note": "The source flag identifies non-Division-I opponents but does not distinguish Division II from Division III. These games are excluded from D2/D3 counts and forecasts.",
            "games": flagged,
        },
        "import_contract": {
            "required_scope_fields": ["sport", "gender", "division", "season"],
            "required_identity_fields": ["team_id", "team_display_name", "athlete_id", "athlete_display_name"],
            "acceptance_rules": [
                "Require an explicit source division value of 2 or 3 before publishing D2/D3 rows.",
                "Require stable team and athlete identifiers and a source receipt hash.",
                "Reject conflicting duplicate identity/stat rows instead of choosing a last row.",
                "Keep unresolved non-D1 schedule signals outside D2/D3 counts until classified.",
            ],
            "next_required_inputs": [
                "A lawful women’s D2/D3 schedule, team, and player release with explicit division labels.",
                "A source receipt and field-level validation for each imported season.",
            ],
        },
        "limitations": [
            "No women’s D2 or D3 rows are fabricated or substituted from D1.",
            "The current source flag is non-D1 only; it cannot identify D2 versus D3.",
        ],
    }


def main() -> None:
    edition = json.loads(EDITION.read_text())
    if not SCHEDULE.exists():
        rows: list[dict[str, Any]] = []
    else:
        import polars as pl

        rows = pl.read_parquet(SCHEDULE).to_dicts()
    OUT.write_text(json.dumps(build_readiness(edition, rows), ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(rows):,} schedule rows inspected)")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT / "ncaa_scraper"))
    main()
