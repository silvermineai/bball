"""Publish explainable source-native women's basketball player rankings."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_player_rankings import build_rankings

EDITION = ROOT / "frontend/public/data/basketball/womens-edition.json"
OUT = ROOT / "frontend/public/data/basketball/womens-rankings.json"


def main():
    edition = json.loads(EDITION.read_text())
    if edition.get("sport") != "basketball" or edition.get("gender") != "women":
        raise SystemExit("women's edition has the wrong scope")
    rankings = build_rankings(edition.get("players", []))
    publication = {
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "season": edition.get("observed_player_season"),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_edition_generated_at": edition.get("generated_at"),
        "min_games": rankings["min_games"],
        "metrics": rankings["metrics"],
        "coverage": rankings["coverage"],
        "leaderboards": rankings["leaderboards"],
        "limitations": [
            "Each board ranks one recorded stat independently; there is no opaque overall grade.",
            "Players below the minimum game threshold or without a recorded value remain outside that board.",
        ],
        "receipts": edition.get("receipts", {}),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(publication, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(edition.get('players', [])):,} players, {len(rankings['leaderboards']):,} lenses)")


if __name__ == "__main__":
    main()
