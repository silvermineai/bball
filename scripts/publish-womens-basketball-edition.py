"""Publish a compact, source-native women’s basketball stats edition.

The edition intentionally contains only observed bulk-release rows: 2026
player season leaders, 2027 roster counts, and the next scheduled games. It is
not a women’s forecast model and never reuses the men’s model or identifiers.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_basketball_sources import client

OUT = ROOT / "frontend/public/data/basketball/womens-edition.json"


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main():
    source = client()
    season_rows, season_receipt = source.load("player_season", 2026)
    roster_rows, roster_receipt = source.load("rosters", 2027)
    schedule_rows, schedule_receipt = source.load("schedule", 2027)

    players = {}
    for row in season_rows:
        aid = str(row.get("athlete_id") or "")
        if not aid:
            continue
        player = players.setdefault(
            aid,
            {
                "player_id": aid,
                "name": row.get("athlete_display_name") or aid,
                "team": row.get("team_display_name") or "Unknown team",
                "position": row.get("athlete_position_abbreviation") or "",
                "stats": {},
            },
        )
        value = num(row.get("value"))
        if value is not None and row.get("stat_name"):
            player["stats"][row["stat_name"]] = value

    metric_specs = {
        "points": ("avgPoints", "Points per game"),
        "rebounds": ("avgRebounds", "Rebounds per game"),
        "assists": ("avgAssists", "Assists per game"),
    }
    leaders = {}
    for key, (stat_name, label) in metric_specs.items():
        rows = []
        for player in players.values():
            value = player["stats"].get(stat_name)
            if value is not None:
                rows.append({
                    "player_id": player["player_id"],
                    "name": player["name"],
                    "team": player["team"],
                    "position": player["position"],
                    "value": round(value, 2),
                })
        leaders[key] = {"label": label, "rows": sorted(rows, key=lambda row: (-row["value"], row["name"]))[:25]}

    team_counts = defaultdict(int)
    for row in roster_rows:
        team = row.get("team_display_name")
        if team:
            team_counts[team] += 1
    upcoming = []
    for row in sorted(schedule_rows, key=lambda item: item.get("date") or ""):
        if str(row.get("status_type_state") or "").casefold() != "pre":
            continue
        upcoming.append({
            "game_id": str(row.get("game_id") or row.get("id")),
            "date": row.get("date"),
            "home": row.get("home_display_name") or row.get("home_name"),
            "away": row.get("away_display_name") or row.get("away_name"),
            "venue": row.get("venue_full_name") or "",
        })
        if len(upcoming) == 25:
            break

    edition = {
        "schema_version": 1,
        "gender": "women",
        "sport": "basketball",
        "season": 2027,
        "observed_player_season": 2026,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "model_status": "not_published",
        "coverage": {
            "player_season_rows": len(season_rows),
            "players": len(players),
            "roster_rows": len(roster_rows),
            "teams": len(team_counts),
            "upcoming_games": len(upcoming),
        },
        "leaders": leaders,
        "teams": [{"team": team, "roster_count": count} for team, count in sorted(team_counts.items(), key=lambda item: (-item[1], item[0]))[:50]],
        "upcoming": upcoming,
        "receipts": {
            "player_season": {"sha256": season_receipt.get("sha256"), "url": season_receipt.get("url")},
            "rosters": {"sha256": roster_receipt.get("sha256"), "url": roster_receipt.get("url")},
            "schedule": {"sha256": schedule_receipt.get("sha256"), "url": schedule_receipt.get("url")},
        },
        "limitations": [
            "This edition is source-native women’s data and does not substitute men’s rows.",
            "A women’s game forecast model is not published until its own training and calibration checks pass.",
            "The observed player season is 2026; the 2027 roster and schedule are upcoming context.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(edition, ensure_ascii=False, indent=2) + "\n")
    print(f"Published {OUT} ({len(players):,} players, {len(upcoming):,} upcoming games)")


if __name__ == "__main__":
    main()
