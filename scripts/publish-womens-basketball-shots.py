"""Publish compact women's basketball shot-coordinate profiles."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_basketball_sources import client
from ncaa_scraper.womens_shot_profiles import GRID_COLUMNS, GRID_ROWS, build_shot_profiles

OUT = ROOT / "frontend/public/data/basketball/womens-shots.json"


def main():
    rows, receipt = client().load("shots", 2026)
    profiles = build_shot_profiles(rows)
    publication = {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "season": 2026,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "coordinate_system": {
            "x_min_ft": -25,
            "x_max_ft": 25,
            "y_min_ft": -5.25,
            "y_max_ft": 41.75,
            "grid_columns": GRID_COLUMNS,
            "grid_rows": GRID_ROWS,
            "notes": "Cells are display bins over source feet coordinates; profile IDs remain source-native.",
        },
        "coverage": {
            "source_attempts": len(rows),
            "profiles": len(profiles),
            "located_attempts": sum(profile["located_attempts"] for profile in profiles),
            "ambiguous_profiles": sum(profile["identity_status"] == "ambiguous" for profile in profiles),
        },
        "profiles": profiles,
        "receipt": {"sha256": receipt.get("sha256"), "url": receipt.get("url")},
        "limitations": [
            "Profiles are keyed by the shot release's shooter identity and are not silently joined to player-season IDs.",
            "The map bins source coordinates for display; all source attempts remain in the attempt totals.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # This is a client-loaded archive: compact JSON keeps the repository and
    # first map load small while retaining the full per-player grid.
    OUT.write_text(json.dumps(publication, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(profiles):,} source shooter profiles, {len(rows):,} attempts)")


if __name__ == "__main__":
    main()
