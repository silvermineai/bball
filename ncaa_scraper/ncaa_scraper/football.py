"""Football import, ranking, forecast and Cloudflare-ready artifact pipeline.

Run: PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime
from pathlib import Path

from .football_model import forecast, train_and_evaluate, train_division_model
from .football_efficiency_model import build as build_efficiency_model
from .football_sources import (
    ATTRIBUTION,
    DATASETS,
    ROOT,
    ReleaseClient,
    utcnow,
)

DB_PATH = ROOT / ".local" / "football.sqlite3"
OUT = ROOT / "frontend" / "public" / "data" / "football"

# SportsDataverse's ESPN schedule release uses ``ii``/``iii`` for the lower
# NCAA divisions while the public board uses the unambiguous D2/D3 labels.
# Keep this normalization at the source boundary so schedule coverage and
# future imports cannot silently split one division into two spellings.
DIVISION_ALIASES = {
    "ii": "d2",
    "d-ii": "d2",
    "division ii": "d2",
    "iii": "d3",
    "d-iii": "d3",
    "division iii": "d3",
}
SUPPORTED_SCHEDULE_DIVISIONS = frozenset({"fbs", "fcs", "d2", "d3"})
LOWER_RESULT_DIVISIONS = frozenset({"d2", "d3"})

# ESPN's player-box release is the only retained football source that carries
# stable athlete IDs across the defensive and specialist box-score categories.
# Keep those rows attached to an exact athlete/team key and expose the source
# fields as additive totals.  The separate advanced defensive/specialist
# release remains name-only and is intentionally not joined here.
BOX_PRODUCTION_FIELDS = {
    # The EPA releases are FBS-scoped. These source-box summaries preserve
    # standard offensive totals for exact-ID FCS rows instead of dropping them
    # simply because no EPA row exists for that division. A category with an
    # EPA production row still keeps the EPA edition below.
    "passing": {
        "completions": ("completions/passingAttempts", "pair_made"),
        "pass_attempts": ("completions/passingAttempts", "pair_attempted"),
        "passing_yards": ("passingYards", "sum"),
        "passing_touchdowns": ("passingTouchdowns", "sum"),
    },
    "rushing": {
        "rushing_attempts": ("rushingAttempts", "sum"),
        "rushing_yards": ("rushingYards", "sum"),
        "rushing_touchdowns": ("rushingTouchdowns", "sum"),
        "long_rushing": ("longRushing", "max"),
    },
    "receiving": {
        "receptions": ("receptions", "sum"),
        "receiving_yards": ("receivingYards", "sum"),
        "receiving_touchdowns": ("receivingTouchdowns", "sum"),
        "long_reception": ("longReception", "max"),
    },
    "defensive": {
        "tackles": ("totalTackles", "sum"),
        "solo_tackles": ("soloTackles", "sum"),
        "sacks": ("sacks", "sum"),
        "tackles_for_loss": ("tacklesForLoss", "sum"),
        "passes_defended": ("passesDefended", "sum"),
        "hurries": ("hurries", "sum"),
        "defensive_touchdowns": ("defensiveTouchdowns", "sum"),
    },
    "interceptions": {
        "interceptions": ("interceptions", "sum"),
        "interception_yards": ("interceptionYards", "sum"),
        "interception_touchdowns": ("interceptionTouchdowns", "sum"),
    },
    "fumbles": {
        "fumbles": ("fumbles", "sum"),
        "fumbles_lost": ("fumblesLost", "sum"),
        "fumbles_recovered": ("fumblesRecovered", "sum"),
    },
    "kicking": {
        "field_goals_made": ("fieldGoalsMade/fieldGoalAttempts", "pair_made"),
        "field_goals_attempted": ("fieldGoalsMade/fieldGoalAttempts", "pair_attempted"),
        "extra_points_made": ("extraPointsMade/extraPointAttempts", "pair_made"),
        "extra_points_attempted": ("extraPointsMade/extraPointAttempts", "pair_attempted"),
        "total_kicking_points": ("totalKickingPoints", "sum"),
    },
    "punting": {
        "punts": ("punts", "sum"),
        "punt_yards": ("puntYards", "sum"),
        "touchbacks": ("touchbacks", "sum"),
        "punts_inside_20": ("puntsInside20", "sum"),
        "long_punt": ("longPunt", "max"),
    },
    "kickReturns": {
        "kick_returns": ("kickReturns", "sum"),
        "kick_return_yards": ("kickReturnYards", "sum"),
        "kick_return_touchdowns": ("kickReturnTouchdowns", "sum"),
        "long_kick_return": ("longKickReturn", "max"),
    },
    "puntReturns": {
        "punt_returns": ("puntReturns", "sum"),
        "punt_return_yards": ("puntReturnYards", "sum"),
        "punt_return_touchdowns": ("puntReturnTouchdowns", "sum"),
        "long_punt_return": ("longPuntReturn", "max"),
    },
}


def _source_pair(value):
    """Parse a source ``made/attempted`` field without treating blanks as zero."""
    if not isinstance(value, str) or "/" not in value:
        return (None, None)
    left, right = value.split("/", 1)
    return (number(left.strip()), number(right.strip()))


def box_category_production(rows: list[dict], category: str) -> dict | None:
    """Aggregate exact-ID player-box rows for one non-EPA category.

    This is a source-native summary: totals are only summed when the source
    reports a numeric field, maxima retain source long-play fields, and rates
    are derived only from the corresponding retained totals.  A category with
    no observed numeric fields returns ``None`` so unavailable is never shown
    as a zero.
    """
    fields = BOX_PRODUCTION_FIELDS.get(category)
    if not fields:
        return None
    totals: dict[str, float] = {}
    games: set[str] = set()
    records = 0
    for row in rows:
        if row.get("category") != category:
            continue
        observed = False
        for output, (source, operation) in fields.items():
            value = row.get(source)
            if operation.startswith("pair_"):
                made, attempted = _source_pair(value)
                value = made if operation == "pair_made" else attempted
            else:
                value = number(value)
            if value is None:
                continue
            observed = True
            if operation == "max":
                totals[output] = max(totals.get(output, value), value)
            else:
                totals[output] = totals.get(output, 0) + value
        if observed:
            records += 1
            game_id = row.get("game_id")
            if game_id not in (None, ""):
                games.add(str(game_id))
    if not totals:
        return None
    # These rates are explicitly derived from source totals; no source blank
    # is converted into a zero denominator.
    if totals.get("field_goals_attempted", 0) > 0:
        totals["field_goal_pct"] = totals.get("field_goals_made", 0) / totals["field_goals_attempted"]
    if totals.get("extra_points_attempted", 0) > 0:
        totals["extra_point_pct"] = totals.get("extra_points_made", 0) / totals["extra_points_attempted"]
    if totals.get("punts", 0) > 0:
        totals["gross_punt_yards_per_punt"] = totals.get("punt_yards", 0) / totals["punts"]
    if totals.get("kick_returns", 0) > 0:
        totals["kick_return_yards_per_return"] = totals.get("kick_return_yards", 0) / totals["kick_returns"]
    if totals.get("punt_returns", 0) > 0:
        totals["punt_return_yards_per_return"] = totals.get("punt_return_yards", 0) / totals["punt_returns"]
    clean = {
        key: int(value) if float(value).is_integer() else round(value, 6)
        for key, value in totals.items()
        if math.isfinite(value)
    }
    return {"records": records, "games": len(games), "metrics": clean}


def box_offensive_board_production(summary: dict, category: str) -> dict:
    """Normalize source-box offensive totals to the player board shape.

    EPA fields remain unavailable for these rows. The explicit source marker
    lets the UI distinguish retained box totals from EPA production instead of
    presenting a missing EPA value as a zero.
    """
    metrics = summary["metrics"]
    if category == "passing":
        plays = metrics.get("pass_attempts")
        yards = metrics.get("passing_yards")
        touchdowns = metrics.get("passing_touchdowns")
    elif category == "rushing":
        plays = metrics.get("rushing_attempts")
        yards = metrics.get("rushing_yards")
        touchdowns = metrics.get("rushing_touchdowns")
    elif category == "receiving":
        plays = metrics.get("receptions")
        yards = metrics.get("receiving_yards")
        touchdowns = metrics.get("receiving_touchdowns")
    else:
        raise ValueError(f"Unsupported offensive box category: {category}")
    yards_per_play = yards / plays if plays else None
    return {
        "plays": plays,
        "yards": yards,
        "yards_per_play": round(yards_per_play, 6) if yards_per_play is not None else None,
        "epa": None,
        "epa_per_play": None,
        "success_rate": None,
        "touchdowns": touchdowns,
        "games": summary["games"],
        "rank": None,
        "source": "box",
    }


def normalize_division(value):
    if value in (None, ""):
        return None
    normalized = str(value).strip().lower()
    return DIVISION_ALIASES.get(normalized, normalized)


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def normalize_game(row: dict) -> dict:
    required = ("game_id", "season", "start_date", "home_id", "away_id")
    if not all(row.get(k) for k in required):
        raise ValueError("Incomplete schedule identity")
    datetime.fromisoformat(row["start_date"].replace("Z", "+00:00"))
    game = {
        "id": row["game_id"],
        "season": int(row["season"]),
        "kickoff": row["start_date"],
        "home_id": row["home_id"],
        "away_id": row["away_id"],
        "home_name": row.get("home_team"),
        "away_name": row.get("away_team"),
        "home_conference": row.get("home_conference"),
        "away_conference": row.get("away_conference"),
        "home_division": normalize_division(row.get("home_division")),
        "away_division": normalize_division(row.get("away_division")),
        "home_score": number(row.get("home_points")),
        "away_score": number(row.get("away_points")),
        "completed": int(row.get("completed") == "true"),
        "neutral": int(row.get("neutral_site") == "true"),
        "week": int(row["week"]) if row.get("week") else None,
        "venue": row.get("venue"),
        "time_tbd": int(row.get("start_time_tbd") == "true"),
        "source_json": json.dumps(row),
    }
    # Preserve source finals with missing scores; model eligibility excludes them.
    return game


def store_rows(conn, dataset, year, rows, receipt):
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO football_sources VALUES (?,?,?)",
            (dataset, year, json.dumps(receipt)),
        )
        if dataset == "schedule":
            conn.execute("DELETE FROM football_games WHERE season=?", (year,))
            for row in rows:
                g = normalize_game(row)
                conn.execute(
                    f"INSERT OR REPLACE INTO football_games ({','.join(g)}) VALUES ({','.join('?' for _ in g)})",
                    tuple(g.values()),
                )
        else:
            conn.execute(
                "DELETE FROM football_stats WHERE dataset=? AND season=?",
                (dataset, year),
            )
            records = []
            for i, row in enumerate(rows):
                compact = {k: v for k, v in row.items() if v not in ("", None)}
                records.append(
                    (
                        dataset,
                        year,
                        str(i),
                        row.get("athlete_id") or row.get("player_id"),
                        row.get("team_id")
                        or row.get("pos_team_id")
                        or row.get("def_pos_team_id"),
                        # NCAA-derived player rows call these identifiers
                        # contest_id/espn_game_id. Prefer the ESPN game ID
                        # when supplied so the raw evidence can show schedule
                        # context; preserve contest ID when it is the only
                        # game key available.
                        row.get("game_id")
                        or row.get("espn_game_id")
                        or row.get("contest_id"),
                        row.get("category") or dataset,
                        json.dumps(compact),
                    )
                )
            conn.executemany(
                "INSERT INTO football_stats VALUES (?,?,?,?,?,?,?,?)", records
            )
        if dataset == "betting":
            for row in rows:
                observed = receipt["fetched_at"]
                pregame = False
                # Historical archive lacks bookmaker/time provenance. Retain, but never treat as closing/live odds.
                conn.execute(
                    "INSERT OR IGNORE INTO football_markets VALUES (?,?,?,?,?,?,?)",
                    (
                        row["game_id"],
                        observed,
                        "SportsDataverse archive",
                        number(row.get("home_team_spread")),
                        number(row.get("over_under")),
                        int(pregame),
                        json.dumps(row),
                    ),
                )


def read_stats(conn, dataset: str, year: int) -> list[dict]:
    return [
        json.loads(row[0])
        for row in conn.execute(
            "SELECT stats_json FROM football_stats WHERE dataset=? AND season=?",
            (dataset, year),
        )
    ]


def player_board(conn, year):
    teams = {r["team_id"]: r for r in read_stats(conn, "teams", year)}
    players = {}
    box_rows = read_stats(conn, "box", year)
    box_by_player: dict[tuple[str, str], list[dict]] = {}
    for r in box_rows:
        aid, tid = r.get("athlete_id"), r.get("team_id")
        if not aid or not tid:
            continue
        key = (aid, tid)
        if key not in players:
            team = teams.get(tid, {})
            players[key] = {
                "id": aid,
                "team_id": tid,
                "name": r.get("athlete_name", aid),
                "team": team.get("short_display_name", tid),
                "conference": team.get("conference_short_name", ""),
                "division": team.get("division", "unknown"),
                "season": year,
                "categories": set(),
                "games": set(),
                "production": {},
            }
        players[key]["categories"].add(r.get("category", "unknown"))
        players[key]["games"].add(r["game_id"])
        # Keep the source box rows available for exact-ID defensive and
        # specialist summaries.  Name-only advanced event rows never enter
        # this map and therefore cannot be attached by a guessed crosswalk.
        box_by_player.setdefault(key, []).append(r)
    boards = {}
    for category, minimum in [("passing", 100), ("rushing", 50), ("receiving", 30)]:
        qualified = []
        for r in read_stats(conn, category, year):
            aid, tid = r.get("player_id"), r.get("team_id")
            if not aid or not tid:
                continue
            name = next((v for k, v in r.items() if k.endswith("player_name")), aid)
            key = (aid, tid)
            players.setdefault(
                key,
                {
                    "id": aid,
                    "team_id": tid,
                    "name": name,
                    "team": r.get("pos_team", tid),
                    "conference": r.get("conference", ""),
                    "division": r.get("division", "unknown"),
                    "season": year,
                    "categories": set(),
                    "games": set(),
                    "production": {},
                },
            )
            players[key]["categories"].add(category)
            data = {
                "plays": number(r.get("plays")),
                "yards": number(r.get("yards")),
                "epa": number(r.get("TEPA")),
                "epa_per_play": number(r.get("EPAplay")),
                "success_rate": number(r.get("success")),
                "yards_per_play": number(r.get("yardsplay")),
                "touchdowns": number(
                    r.get("rushing_td")
                    if category == "rushing"
                    else r.get("passing_td")
                ),
                "games": number(r.get("games")),
                "rank": None,
            }
            players[key]["production"][category] = data
            if (
                r.get("division") == "fbs"
                and (data["plays"] or 0) >= minimum
                and data["epa"] is not None
            ):
                qualified.append((key, data))
        qualified.sort(key=lambda pair: (-pair[1]["epa"], pair[0]))
        for i, (key, data) in enumerate(qualified):
            data["rank"] = i + 1
        boards[category] = {
            "minimum_plays": minimum,
            "qualified": len(qualified),
            "metric": "total EPA",
            "scope": "FBS; within category",
        }
    for p in players.values():
        key = (p["id"], p["team_id"])
        for category in BOX_PRODUCTION_FIELDS:
            summary = box_category_production(box_by_player.get(key, []), category)
            if summary is not None:
                if category in ("passing", "rushing", "receiving"):
                    # EPA rows remain authoritative where present. FCS rows
                    # receive exact-ID source-box totals only when no EPA row
                    # exists for the same player/team/category.
                    if category not in p["production"]:
                        p["production"][category] = box_offensive_board_production(summary, category)
                else:
                    p["production"][category] = summary
        p["categories"] = sorted(p["categories"])
        p["box_games"] = len(p.pop("games"))
    return {
        "season": year,
        "rankings": boards,
        "players": sorted(players.values(), key=lambda p: p["name"]),
    }


def personnel_preview(conn, year: int, limit: int = 12) -> list[dict]:
    """Return a small deterministic roster table for the static football desk.

    The football recruiting route is exported as static HTML. Keep its first
    rows in the same publication as the D1 records so the page can show real
    personnel immediately, before the interactive catalog hydrates.
    """
    rows = read_stats(conn, "rosters", year)

    def text(row: dict, *keys: str) -> str | None:
        for key in keys:
            value = row.get(key)
            if value not in (None, ""):
                return str(value)
        return None

    def numeric(value):
        parsed = number(value)
        if parsed is None:
            return None
        return int(parsed) if parsed.is_integer() else parsed

    ordered = sorted(
        rows,
        key=lambda row: (
            text(row, "team_short_display_name", "team_display_name", "team_id") or "",
            text(row, "athlete_display_name", "full_name", "athlete_id") or "",
            text(row, "athlete_id") or "",
        ),
    )
    return [
        {
            "id": text(row, "athlete_id"),
            "name": text(row, "athlete_display_name", "full_name", "display_name", "athlete_id"),
            "team": text(row, "team_short_display_name", "team_display_name", "team_id"),
            "position": text(row, "position_abbreviation", "position_name", "position"),
            "experience": text(row, "experience_display_value", "experience_abbreviation"),
            "status": text(row, "status_name", "status_type", "status"),
            "height": numeric(row.get("height")),
            "weight": numeric(row.get("weight")),
        }
        for row in ordered[:limit]
    ]


def lower_division_results(
    games: list[dict],
    season: int,
    generated_at: str,
    *,
    divisions: set[str] | frozenset[str] | None = None,
) -> dict:
    """Build a source-native division result and forecast archive.

    Player production remains outside this schedule artifact. The score model
    is independently fitted per exact division after the result archive is
    assembled, so a missing history or mixed-division game cannot manufacture
    a rating or prediction.
    Cross-division games are represented once for each lower division involved;
    team summaries only credit a team whose exact schedule label matches that
    division. Games with missing scores remain visible in coverage but cannot
    affect win/loss or points summaries.

    The default remains the historical D2/D3 release contract. The football
    publisher also uses this function with an explicit ``{"fcs", "d2", "d3"}``
    scope so FCS-versus-FCS forecasts can be published in the D1 desk without
    changing the primary FBS model or its live API edition.
    """
    result_divisions = frozenset(divisions or LOWER_RESULT_DIVISIONS)
    unsupported = result_divisions - SUPPORTED_SCHEDULE_DIVISIONS
    if unsupported:
        raise ValueError(f"Unsupported football result divisions: {sorted(unsupported)}")
    rows: list[dict] = []
    summaries: dict[str, dict[str, int]] = {}
    teams: dict[str, dict[str, dict[str, object]]] = {division: {} for division in result_divisions}
    models: dict[str, dict[str, object] | None] = {division: None for division in result_divisions}
    forecasts: dict[str, list[dict]] = {division: [] for division in result_divisions}
    for division in sorted(result_divisions):
        summaries[division] = {
            "games": 0,
            "score_complete": 0,
            "scores_missing": 0,
            "upcoming_games": 0,
            "forecast_games": 0,
        }
    for game in games:
        if game.get("season") != season or not game.get("completed"):
            continue
        home_division = normalize_division(game.get("home_division"))
        away_division = normalize_division(game.get("away_division"))
        involved = sorted({d for d in (home_division, away_division) if d in result_divisions})
        if not involved:
            continue
        score_complete = game.get("home_score") is not None and game.get("away_score") is not None
        for division in involved:
            summaries[division]["games"] += 1
            summaries[division]["score_complete" if score_complete else "scores_missing"] += 1
            rows.append({
                "game_id": str(game["id"]),
                "kickoff": game["kickoff"],
                "week": game.get("week"),
                "scope_division": division,
                "home_id": str(game["home_id"]),
                "home_name": game.get("home_name") or str(game["home_id"]),
                "home_division": home_division,
                "away_id": str(game["away_id"]),
                "away_name": game.get("away_name") or str(game["away_id"]),
                "away_division": away_division,
                "home_score": game.get("home_score"),
                "away_score": game.get("away_score"),
                "neutral": bool(game.get("neutral")),
                "score_complete": score_complete,
            })
            if not score_complete:
                continue
            for side in ("home", "away"):
                if normalize_division(game.get(f"{side}_division")) != division:
                    continue
                team_id = str(game[f"{side}_id"])
                team = teams[division].setdefault(team_id, {
                    "team_id": team_id,
                    "team": game.get(f"{side}_name") or team_id,
                    "division": division,
                    "games": 0,
                    "wins": 0,
                    "losses": 0,
                    "points_for": 0,
                    "points_against": 0,
                })
                own_score = game[f"{side}_score"]
                opponent = "away" if side == "home" else "home"
                opponent_score = game[f"{opponent}_score"]
                team["games"] += 1
                team["wins"] += int(own_score > opponent_score)
                team["losses"] += int(own_score < opponent_score)
                team["points_for"] += own_score
                team["points_against"] += opponent_score
    for division in sorted(result_divisions):
        try:
            model = train_division_model(games, generated_at, season, division)
        except ValueError:
            model = None
        if model is None:
            continue
        models[division] = {
            key: model[key]
            for key in (
                "id",
                "version",
                "division",
                "target_season",
                "cutoff",
                "training_seasons",
                "training_games",
                "calibration_season",
                "calibration",
                "limitations",
            )
        }
        directory = {
            str(game.get(f"{side}_id")): game.get(f"{side}_name") or str(game.get(f"{side}_id"))
            for game in games
            if game.get("season") == season
            for side in ("home", "away")
            if normalize_division(game.get(f"{side}_division")) == division
        }
        ratings = []
        for index, team_id in enumerate(model["teams"]):
            ratings.append({
                "team_id": str(team_id),
                "team": directory.get(str(team_id), str(team_id)),
                "division": division,
                "rating": round(float(model["margin_coef"][index + 2]), 2),
            })
        ratings.sort(key=lambda row: (-row["rating"], row["team"]))
        for rank, row in enumerate(ratings, 1):
            row["rank"] = rank
        models[division]["ratings"] = ratings
        for game in games:
            if game.get("season") != season or game.get("completed"):
                continue
            if normalize_division(game.get("home_division")) != division or normalize_division(game.get("away_division")) != division:
                continue
            if not game.get("kickoff") or game["kickoff"] <= generated_at:
                continue
            summaries[division]["upcoming_games"] += 1
            prediction = forecast(model, game)
            if prediction is None:
                continue
            summaries[division]["forecast_games"] += 1
            forecasts[division].append({
                "game_id": str(game["id"]),
                "kickoff": game["kickoff"],
                "week": game.get("week"),
                "scope_division": division,
                "home_id": str(game["home_id"]),
                "home_name": game.get("home_name") or str(game["home_id"]),
                "away_id": str(game["away_id"]),
                "away_name": game.get("away_name") or str(game["away_id"]),
                "neutral": bool(game.get("neutral")),
                "model_id": model["id"],
                "prediction": prediction,
            })
        forecasts[division].sort(key=lambda row: (row["kickoff"], row["game_id"]))
    rows.sort(key=lambda row: (row["kickoff"], row["game_id"], row["scope_division"]), reverse=True)
    team_rows = {
        division: sorted(
            teams[division].values(),
            key=lambda row: (-int(row["wins"]), -int(row["points_for"]) + int(row["points_against"]), str(row["team"])),
        )
        for division in sorted(result_divisions)
    }
    return {
        "schema_version": 2,
        "sport": "football",
        "season": season,
        "generated_at": generated_at,
        "scope": "FCS, D2 and D3 completed schedule results" if "fcs" in result_divisions else "D2/D3 completed schedule results",
        "coverage": summaries,
        "teams": team_rows,
        "rows": rows,
        "models": models,
        "forecasts": forecasts,
        "limitations": [
            "Results come from the retained schedule release and are not a player-stat census.",
            "Rows with missing scores remain visible in coverage and are excluded from team records.",
            "Forecasts and ratings use only exact-division final scores, venue, and team identity; player availability and cross-division strength are not modeled.",
        ],
    }


def build(conn, season=2026):
    now = utcnow()
    # The active forecast edition is a five-season window. Older schedule rows
    # may be retained locally for player-history work; they must not silently
    # change the production model when a refresh reuses that warehouse.
    first_season = season - 4
    games = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM football_games WHERE season BETWEEN ? AND ? ORDER BY kickoff,id",
            (first_season, season),
        )
    ]
    validation = {}
    model = train_and_evaluate(games, now, season, validation_out=validation)
    upcoming = []
    for g in games:
        if (
            g["season"] != season
            or g["completed"]
            or g["kickoff"] <= now
            or not (
                g["home_division"] in SUPPORTED_SCHEDULE_DIVISIONS
                or g["away_division"] in SUPPORTED_SCHEDULE_DIVISIONS
            )
        ):
            continue
        prediction = (
            forecast(model, g)
            if g["home_division"] == g["away_division"] == "fbs"
            else None
        )
        entry = {k: v for k, v in g.items() if k != "source_json"}
        entry["prediction"] = prediction
        if prediction:
            conn.execute(
                "INSERT OR IGNORE INTO football_predictions VALUES (?,?,?,?,?,?)",
                (
                    g["id"],
                    model["id"],
                    now,
                    prediction["home_margin"],
                    prediction["total"],
                    prediction["home_win_probability"],
                ),
            )
        entry["market"] = None
        market = conn.execute(
            "SELECT * FROM football_markets WHERE game_id=? AND is_pregame=1 ORDER BY observed_at DESC LIMIT 1",
            (g["id"],),
        ).fetchone()
        if market:
            entry["market"] = {
                k: market[k] for k in ["home_spread", "total", "observed_at", "source"]
            }
            entry["market"]["margin_difference"] = (
                round(prediction["home_margin"] + market["home_spread"], 2)
                if prediction and market["home_spread"] is not None
                else None
            )
        upcoming.append(entry)
    teams = {r["team_id"]: r for r in read_stats(conn, "teams", season)}
    ratings = []
    # These are schedule-adjusted score margins, not the publisher's proprietary ratings.
    for i, tid in enumerate(model["teams"]):
        t = teams.get(tid, {})
        ratings.append(
            {
                "id": tid,
                "name": t.get("short_display_name", tid),
                "conference": t.get("conference_short_name", ""),
                "rating": round(model["margin_coef"][i + 2], 2),
            }
        )
    ratings.sort(key=lambda r: -r["rating"])
    for i, row in enumerate(ratings):
        row["rank"] = i + 1
    sources = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT receipt_json FROM football_sources ORDER BY season,dataset"
        )
    ]
    coverage = {
        "games": len(games),
        "completed_games": sum(g["completed"] for g in games),
        "finals_missing_scores": sum(
            bool(
                g["completed"] and (g["home_score"] is None or g["away_score"] is None)
            )
            for g in games
        ),
        "upcoming_games": len(upcoming),
        "forecast_games": sum(g["prediction"] is not None for g in upcoming),
        "box_rows": conn.execute(
            "SELECT count(*) FROM football_stats WHERE dataset='box' AND season BETWEEN ? AND ?",
            (season - 1, season),
        ).fetchone()[0],
        "ncaa_player_stats_rows": conn.execute(
            "SELECT count(*) FROM football_stats WHERE dataset='ncaa_player_stats'"
        ).fetchone()[0],
        "market_observations": conn.execute(
            "SELECT count(*) FROM football_markets"
        ).fetchone()[0],
        "pregame_market_observations": conn.execute(
            "SELECT count(*) FROM football_markets WHERE is_pregame=1"
        ).fetchone()[0],
        "direct_sources": {
            "ESPN": "Disabled: automated extraction restricted by source terms",
            "NCAA": "Disabled: robots.txt disallows crawling",
        },
    }
    overview = {
        "generated_at": now,
        "season": season,
        "attribution": ATTRIBUTION,
        "coverage": coverage,
        "model": model,
        "ratings": ratings,
        "upcoming": upcoming,
        "sources": sources,
    }
    conn.execute(
        "INSERT OR IGNORE INTO football_models VALUES (?,?,?,?)",
        (model["id"], now, now, json.dumps(model)),
    )
    OUT.mkdir(parents=True, exist_ok=True)
    validation.update(
        {
            "generated_at": now,
            "sources": [s for s in sources if s["dataset"] == "schedule"],
            "calibration": model["calibration"],
            "evaluation": model["evaluation"],
            "implementation_sha256": hashlib.sha256(
                Path(__file__).with_name("football_model.py").read_bytes()
            ).hexdigest(),
        }
    )
    # The production forecast intentionally fits only the five-season `games`
    # slice above. The research challenger needs older retained schedules to
    # construct genuinely lagged feature states for its dated holdouts.
    all_games = [dict(r) for r in conn.execute("SELECT * FROM football_games ORDER BY kickoff,id")]
    efficiency_model = build_efficiency_model(conn, all_games, model, upcoming, season)
    # Keep FCS predictions in the receipt-backed division archive. The
    # production/live API edition remains the validated FBS model; this exact
    # FCS model is exposed as a separate static cohort so its lineage cannot
    # be confused with the primary model.
    lower_results = lower_division_results(
        games,
        season,
        now,
        divisions=frozenset({"fcs", "d2", "d3"}),
    )
    schedule_receipt = next((source for source in sources if source.get("dataset") == "schedule" and int(source.get("season", -1)) == season), None)
    if schedule_receipt:
        lower_results["source"] = {
            key: schedule_receipt.get(key)
            for key in ("dataset", "season", "url", "fetched_at", "sha256", "last_modified")
        }
    artifacts = {"overview": overview, "validation": validation, "efficiency-model": efficiency_model, "lower-division-results-" + str(season): lower_results}
    for year in [season - 1, season]:
        artifacts[f"players-{year}"] = player_board(conn, year)
    artifacts[f"personnel-preview-{season}"] = personnel_preview(conn, season)
    for name, payload in artifacts.items():
        encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False)
        (OUT / f"{name}.json").write_text(encoded)
    # Large public JSON artifacts are served by Cloudflare static assets. Keep
    # only their hashes in D1 so individual SQL rows remain comfortably bounded.
    conn.execute("DELETE FROM football_artifacts")
    manifest = {
        name: {
            "sha256": hashlib.sha256((OUT / f"{name}.json").read_bytes()).hexdigest()
        }
        for name in artifacts
    }
    conn.execute(
        "INSERT INTO football_artifacts VALUES (?,?,?)",
        ("manifest", now, json.dumps(manifest)),
    )
    conn.commit()
    print(
        json.dumps(
            {
                "coverage": coverage,
                "evaluation": model["evaluation"],
                "players": {
                    k: len(v["players"])
                    for k, v in artifacts.items()
                    if k.startswith("players")
                },
            },
            indent=2,
        )
    )
    return overview


def export_sql(conn, path: Path):
    # Idempotent upserts preserve prior prediction/market observations on D1.
    with path.open("w") as f:
        for dataset, year in conn.execute(
            "SELECT dataset,season FROM football_sources"
        ):
            if dataset == "schedule":
                f.write(f"DELETE FROM football_games WHERE season={int(year)};\n")
            elif dataset in DATASETS:
                f.write(
                    f"DELETE FROM football_stats WHERE dataset='{dataset}' AND season={int(year)};\n"
                )
        for line in conn.iterdump():
            if line.startswith("INSERT INTO"):
                f.write(line.replace("INSERT INTO", "INSERT OR REPLACE INTO", 1) + "\n")
    print(f"D1 upserts: {path}")


def datasets_for_year(season: int, year: int) -> list[str]:
    """Return source datasets for a year without narrowing NCAA history."""
    source_years = set(range(season - 4, season + 1))
    ncaa_player_years = set(range(2013, min(season, 2025) + 1))
    if year not in source_years:
        return ["ncaa_player_stats"] if year in ncaa_player_years else []
    if year < season - 1:
        datasets = ["schedule", "teams", "team_advanced"]
        if year in ncaa_player_years:
            datasets.append("ncaa_player_stats")
        return datasets
    return [
        dataset for dataset in DATASETS
        if dataset != "ncaa_player_stats" or year in ncaa_player_years
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--sql", type=Path)
    args = parser.parse_args()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript((ROOT / "worker/migrations/0008_football.sql").read_text())
    if not args.build_only:
        client = ReleaseClient()
        # The NCAA-derived player release is legally available from 2013
        # through 2025. Retain that complete source history even though the
        # model's schedule/team warehouse remains a five-season window.
        source_years = set(range(args.season - 4, args.season + 1))
        ncaa_player_years = set(range(2013, min(args.season, 2025) + 1))
        for year in sorted(source_years | ncaa_player_years):
            datasets = datasets_for_year(args.season, year)
            for dataset in datasets:
                # Required downloads fail the run instead of silently producing partial coverage.
                rows, receipt = client.load(dataset, year, refresh=args.refresh)
                store_rows(conn, dataset, year, rows, receipt)
                print(f"Imported {dataset}/{year}: {len(rows):,} rows", flush=True)
    build(conn, args.season)
    if args.sql:
        export_sql(conn, args.sql)
    conn.close()


if __name__ == "__main__":
    main()
