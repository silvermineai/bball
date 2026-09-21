"""Publish a compact, source-native women’s basketball stats edition.

The edition intentionally contains only observed bulk-release rows: 2026
player season leaders, 2027 roster counts, and the next scheduled games. It is
not a women’s forecast model and never reuses the men’s model or identifiers.
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_basketball_sources import client

OUT = ROOT / "frontend/public/data/basketball/womens-edition.json"
BOX_OUT = ROOT / "frontend/public/data/basketball/womens-box-player-stats.json"

BOX_STAT_FIELDS = (
    ("minutes", "minutes"),
    ("points", "points"),
    ("rebounds", "rebounds"),
    ("offensive_rebounds", "offensive_rebounds"),
    ("defensive_rebounds", "defensive_rebounds"),
    ("assists", "assists"),
    ("steals", "steals"),
    ("blocks", "blocks"),
    ("turnovers", "turnovers"),
    ("fouls", "fouls"),
    ("field_goals_made", "field_goals_made"),
    ("field_goals_attempted", "field_goals_attempted"),
    ("three_point_field_goals_made", "three_point_field_goals_made"),
    ("three_point_field_goals_attempted", "three_point_field_goals_attempted"),
    ("free_throws_made", "free_throws_made"),
    ("free_throws_attempted", "free_throws_attempted"),
)

# Keep a receipt-backed ledger for every player-box field that is useful for
# player production or game context.  The ledger is deliberately generated
# from the raw release rows rather than from the aggregate output, so a field
# that is present only on some rows remains visible as partial source coverage.
BOX_SOURCE_FIELD_ORDER = (
    "game_id",
    "game_date",
    "athlete_id",
    "athlete_display_name",
    "athlete_position_abbreviation",
    "team_id",
    "team_display_name",
    "opponent_team_id",
    "opponent_team_display_name",
    "minutes",
    "field_goals_made",
    "field_goals_attempted",
    "three_point_field_goals_made",
    "three_point_field_goals_attempted",
    "free_throws_made",
    "free_throws_attempted",
    "offensive_rebounds",
    "defensive_rebounds",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls",
    "points",
    "starter",
    "ejected",
    "did_not_play",
    "active",
    "team_winner",
    "team_score",
    "opponent_team_score",
)


def num(value):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def source_field_coverage(rows):
    """Count observed and finite values without coercing missing data.

    This is a source audit, not a completeness claim: ``observed_rows`` counts
    non-empty source cells and ``finite_numeric_rows`` counts only values that
    can be safely used as numeric statistics.  Identity/context fields retain
    identity and context fields are still counted, but are never used to
    manufacture player totals.
    """
    fields = set(BOX_SOURCE_FIELD_ORDER)
    fields.update(key for row in rows for key in row)
    output = []
    for field in sorted(fields):
        observed = 0
        numeric = 0
        for row in rows:
            value = row.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            observed += 1
            if num(value) is not None:
                numeric += 1
        output.append({
            "field": field,
            "observed_rows": observed,
            "finite_numeric_rows": numeric,
        })
    return output


def build_player_box_stats(rows):
    """Aggregate retained WBB player box rows without inventing appearances.

    The player-season release currently covers only a subset of the player IDs
    present in the source's game-level box file.  Keep those game rows in a
    separate, receipt-backed publication so box-score-only athletes remain
    discoverable.  DNP rows count as observed source rows but do not contribute
    to games played or any numeric total.
    """
    grouped = {}
    games = set()
    dnp_rows = 0
    played_rows = 0
    skipped_rows = 0
    for row in rows:
        athlete_id = str(row.get("athlete_id") or "")
        game_id = str(row.get("game_id") or "")
        if not athlete_id or not game_id:
            skipped_rows += 1
            continue
        games.add(game_id)
        player = grouped.setdefault(
            athlete_id,
            {
                "player_id": athlete_id,
                "name": row.get("athlete_display_name") or athlete_id,
                "team": row.get("team_display_name") or "Unknown team",
                "team_id": str(row.get("team_id") or ""),
                "position": row.get("athlete_position_abbreviation") or "",
                "box_rows": 0,
                "dnp_rows": 0,
                "games_played": 0,
                "starts": 0,
                "totals": {output: 0.0 for _, output in BOX_STAT_FIELDS},
                "present_fields": set(),
                "teams": {},
            },
        )
        team_id = str(row.get("team_id") or "")
        team_name = row.get("team_display_name") or team_id or "Unknown team"
        if team_id:
            player["teams"].setdefault(team_id, set()).add(team_name)
        player["box_rows"] += 1
        if str(row.get("did_not_play") or "").casefold() == "true":
            dnp_rows += 1
            player["dnp_rows"] += 1
            continue
        # A played box row has a finite points value in this source.  Rows
        # without one are retained as observed rows but cannot be treated as
        # appearances or converted into a zero stat line.
        if num(row.get("points")) is None:
            skipped_rows += 1
            continue
        played_rows += 1
        player["games_played"] += 1
        player["starts"] += int(str(row.get("starter") or "").casefold() == "true")
        for source, output in BOX_STAT_FIELDS:
            value = num(row.get(source))
            if value is None:
                continue
            player["totals"][output] += value
            player["present_fields"].add(output)

    output = []
    for player in grouped.values():
        games_played = player["games_played"]
        totals = {
            key: round(value, 4)
            for key, value in player["totals"].items()
            if key in player["present_fields"]
        }
        per_game = {
            key: round(value / games_played, 4)
            for key, value in totals.items()
        } if games_played else {}

        team_rows = [
            {
                "team_id": team_id,
                "team": sorted(names)[0] if names else team_id,
            }
            for team_id, names in sorted(player["teams"].items())
        ]
        team_names = [row["team"] for row in team_rows]
        single_team = len(team_rows) == 1

        def pct(made, attempted):
            attempts = totals.get(attempted)
            makes = totals.get(made)
            return round(makes / attempts * 100.0, 4) if attempts else None

        output.append({
            "player_id": player["player_id"],
            "name": player["name"],
            "team": team_names[0] if single_team else "Multiple teams",
            "team_id": team_rows[0]["team_id"] if single_team else "",
            "teams": team_rows,
            "position": player["position"],
            "box_rows": player["box_rows"],
            "dnp_rows": player["dnp_rows"],
            "games_played": games_played,
            "starts": player["starts"],
            "totals": totals,
            "per_game": per_game,
            "shooting": {
                "field_goal_pct": pct("field_goals_made", "field_goals_attempted"),
                "three_point_pct": pct("three_point_field_goals_made", "three_point_field_goals_attempted"),
                "free_throw_pct": pct("free_throws_made", "free_throws_attempted"),
            },
        })
    output.sort(key=lambda player: (-player["games_played"], -player["totals"].get("points", 0), player["name"], player["player_id"]))
    return output, {
        "rows": len(rows),
        "players": len(output),
        "games": len(games),
        "played_rows": played_rows,
        "dnp_rows": dnp_rows,
        "skipped_rows": skipped_rows,
        "teams": len({player["team_id"] for player in output if player["team_id"]}),
        "players_multiple_teams": sum(1 for player in output if len(player.get("teams", [])) > 1),
        "source_fields": source_field_coverage(rows),
    }


def build_team_stats(rows):
    """Group every numeric source stat by its stable team identifier.

    The release contains one row per team/stat.  Keep the source's complete
    metric set instead of selecting a few display leaders, and fail closed if
    a source revision supplies two different values for the same key.  A
    conflicting value is an identity/data-integrity problem, not a reason to
    silently choose whichever row happens to be last.
    """
    grouped = {}
    numeric_rows = 0
    skipped_rows = 0
    for row in rows:
        team_id = str(row.get("team_id") or "")
        stat_name = str(row.get("stat_name") or "")
        value = num(row.get("value"))
        if not team_id or not stat_name or value is None:
            skipped_rows += 1
            continue
        team = grouped.setdefault(
            team_id,
            {
                "team_id": team_id,
                "team": row.get("team_display_name") or team_id,
                "abbreviation": row.get("team_abbreviation") or "",
                "stats": {},
                "stat_metadata": {},
            },
        )
        prior = team["stats"].get(stat_name)
        if prior is not None and prior != value:
            raise ValueError(
                f"Conflicting team stat for {team_id}/{stat_name}: {prior} vs {value}"
            )
        team["stats"][stat_name] = round(value, 4)
        team["stat_metadata"][stat_name] = {
            "label": row.get("stat_label") or "",
            "name": row.get("stat_display_name") or stat_name,
            "description": row.get("stat_description") or "",
        }
        numeric_rows += 1
    teams = sorted(grouped.values(), key=lambda item: (item["team"], item["team_id"]))
    return teams, {
        "rows": len(rows),
        "numeric_rows": numeric_rows,
        "skipped_rows": skipped_rows,
        "teams": len(teams),
        "stat_fields": len({name for team in teams for name in team["stats"]}),
    }


def main():
    source = client()
    season_rows, season_receipt = source.load("player_season", 2026)
    team_season_rows, team_season_receipt = source.load("team_season", 2026)
    roster_rows, roster_receipt = source.load("rosters", 2027)
    schedule_rows, schedule_receipt = source.load("schedule", 2027)
    player_box_rows, player_box_receipt = source.load("player_box", 2026)
    team_stats, team_stats_coverage = build_team_stats(team_season_rows)
    box_players, box_player_coverage = build_player_box_stats(player_box_rows)

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
            "team_season_rows": team_stats_coverage["rows"],
            "team_stats_numeric_rows": team_stats_coverage["numeric_rows"],
            "team_stats_skipped_rows": team_stats_coverage["skipped_rows"],
            "team_stats_teams": team_stats_coverage["teams"],
            "team_stats_fields": team_stats_coverage["stat_fields"],
            "roster_rows": len(roster_rows),
            "teams": len(team_counts),
            "upcoming_games": len(upcoming),
            "player_box_rows": box_player_coverage["rows"],
            "player_box_players": box_player_coverage["players"],
            "player_box_games": box_player_coverage["games"],
            "player_box_played_rows": box_player_coverage["played_rows"],
            "player_box_dnp_rows": box_player_coverage["dnp_rows"],
            "player_box_skipped_rows": box_player_coverage["skipped_rows"],
            "player_box_teams": box_player_coverage["teams"],
            "player_box_players_multiple_teams": box_player_coverage["players_multiple_teams"],
        },
        "players": sorted(
            [
                {**player, "stats": {key: round(value, 2) if math.isfinite(value) else None for key, value in player["stats"].items()}}
                for player in players.values()
            ],
            key=lambda player: (-player["stats"].get("avgPoints", -1), player["name"]),
        ),
        "leaders": leaders,
        "team_stats": team_stats,
        "teams": [{"team": team, "roster_count": count} for team, count in sorted(team_counts.items(), key=lambda item: (-item[1], item[0]))[:50]],
        "upcoming": upcoming,
        "receipts": {
            "player_season": {"sha256": season_receipt.get("sha256"), "url": season_receipt.get("url")},
            "team_season": {"sha256": team_season_receipt.get("sha256"), "url": team_season_receipt.get("url")},
            "rosters": {"sha256": roster_receipt.get("sha256"), "url": roster_receipt.get("url")},
            "schedule": {"sha256": schedule_receipt.get("sha256"), "url": schedule_receipt.get("url")},
            "player_box": {"sha256": player_box_receipt.get("sha256"), "url": player_box_receipt.get("url")},
        },
        "limitations": [
            "This edition is source-native women’s data and does not substitute men’s rows.",
            "A women’s game forecast model is not published until its own training and calibration checks pass.",
            "The observed player season is 2026; the 2027 roster and schedule are upcoming context.",
            "Game-level player aggregates are published separately from the player-season release; DNP rows are counted as observed source rows and excluded from played-game totals.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(edition, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    BOX_OUT.write_text(json.dumps({
        "schema_version": 1,
        "sport": "basketball",
        "gender": "women",
        "season": 2026,
        "generated_at": edition["generated_at"],
        "source": "player_box",
        "coverage": box_player_coverage,
        "players": box_players,
        "receipt": {"sha256": player_box_receipt.get("sha256"), "url": player_box_receipt.get("url")},
        "limitations": [
            "Aggregates are arithmetic sums and per-played-game averages of source box rows.",
            "DNP rows remain counted in box_rows and dnp_rows but do not count as games played or enter totals.",
            "This source release does not carry an explicit division field; no D2/D3 classification is inferred.",
        ],
    }, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(players):,} season players, {len(box_players):,} box players, {len(upcoming):,} upcoming games)")


if __name__ == "__main__":
    main()
