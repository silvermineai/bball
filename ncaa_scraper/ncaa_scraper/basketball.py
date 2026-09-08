"""Basketball research warehouse, efficiency ratings and 2026–27 forecasts."""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .basketball_model import fallback_forecast, forecast, game_features, ratio, train
from .basketball_sources import BASKETBALL_ATTRIBUTION, client
from .football import number
from .football_sources import ROOT, utcnow

DB = ROOT / ".local/basketball.sqlite3"
OUT = ROOT / "frontend/public/data/basketball"
STAT_FIELDS = [
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
]

# Numeric publisher fields that are useful for a national context. Compound
# made-attempted fields intentionally stay out of this board because their
# source value is a display string rather than one comparable number.
PUBLISHER_LEADER_SPECS = (
    ("avg_points", "averages", "avgPoints", "Points per game", "per game"),
    ("avg_rebounds", "averages", "avgRebounds", "Rebounds per game", "per game"),
    ("avg_assists", "averages", "avgAssists", "Assists per game", "per game"),
    (
        "field_goal_pct",
        "averages",
        "fieldGoalPct",
        "Field-goal percentage",
        "percent",
    ),
    (
        "three_point_pct",
        "averages",
        "threePointFieldGoalPct",
        "Three-point percentage",
        "percent",
    ),
    (
        "free_throw_pct",
        "averages",
        "freeThrowPct",
        "Free-throw percentage",
        "percent",
    ),
    (
        "assist_turnover_ratio",
        "miscellaneous",
        "assistTurnoverRatio",
        "Assist-to-turnover ratio",
        "ratio",
    ),
    (
        "scoring_efficiency",
        "miscellaneous",
        "scoringEfficiency",
        "Scoring efficiency",
        "ratio",
    ),
)


def identity(v):
    if not v:
        raise ValueError("Missing source identifier")
    return str(v).removesuffix(".0")


def canonical_date(v):
    d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("Source timestamp has no timezone")
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def numeric_box(row, player=False):
    if player:
        return {
            **{k: number(row.get(k)) for k in STAT_FIELDS},
            **{k: row.get(k) for k in ["starter", "ejected", "did_not_play", "active"]},
        }
    ignore = {
        "game_id",
        "season",
        "season_type",
        "game_date",
        "game_date_time",
        "home_away",
        "lead_changes",
    }
    return {
        k: number(v)
        for k, v in row.items()
        if not k.startswith(("team_", "opponent_")) and k not in ignore
    }


def ingest(conn, dataset, year, rows, receipt):
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO bb_sources VALUES (?,?,?)",
            (dataset, year, json.dumps(receipt)),
        )
        tables = {
            "schedule": "bb_games",
            "team_box": "bb_team_box",
            "player_box": "bb_player_box",
            "rosters": "bb_rosters",
            "player_season": "bb_player_season",
            "team_season": "bb_team_season",
            "publisher_ratings": "bb_publisher_ratings",
        "publisher_player_value": "bb_player_value",
        "ncaa_lineups": "bb_lineups",
        "player_core": "bb_player_core",
        "ncaa_rapm": "bb_impact",
        "ncaa_player_box": "bb_ncaa_player_box",
        "ncaa_player_season": "bb_ncaa_player_season",
        "ncaa_team_rosters": "bb_ncaa_rosters",
        "ncaa_shots": "bb_ncaa_player_shooting",
        }
        if dataset in tables:
            conn.execute(f"DELETE FROM {tables[dataset]} WHERE season=?", (year,))
        if dataset == "schedule":
            for r in rows:
                completed = r.get("status_type_completed") == "true"
                conn.execute(
                    "INSERT OR REPLACE INTO bb_games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        identity(r["game_id"]),
                        year,
                        canonical_date(r["date"]),
                        identity(r["home_id"]),
                        identity(r["away_id"]),
                        r.get("home_short_display_name") or r.get("home_display_name"),
                        r.get("away_short_display_name") or r.get("away_display_name"),
                        number(r.get("home_score")) if completed else None,
                        number(r.get("away_score")) if completed else None,
                        int(completed),
                        int(r.get("neutral_site") == "true"),
                        int(number(r.get("status_period")) or 0),
                        int(r.get("time_valid") != "true"),
                        r.get("venue_full_name"),
                        r.get("broadcast"),
                    ),
                )
        elif dataset == "team_box":
            conn.executemany(
                "INSERT OR REPLACE INTO bb_team_box VALUES (?,?,?,?)",
                [
                    (
                        identity(r["game_id"]),
                        identity(r["team_id"]),
                        year,
                        json.dumps(numeric_box(r)),
                    )
                    for r in rows
                ],
            )
        elif dataset == "player_box":
            conn.execute(
                "DELETE FROM bb_unresolved WHERE dataset=? AND season=?",
                (dataset, year),
            )
            for i, r in enumerate(rows):
                if not r.get("athlete_id"):
                    conn.execute(
                        "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
                        (dataset, year, i, "Missing athlete ID", json.dumps(r)),
                    )
                    continue
                aid = identity(r["athlete_id"])
                conn.execute(
                    "INSERT OR REPLACE INTO bb_players VALUES (?,?,?)",
                    (
                        aid,
                        r.get("athlete_display_name") or aid,
                        r.get("athlete_position_abbreviation"),
                    ),
                )
                conn.execute(
                    "INSERT OR REPLACE INTO bb_player_box VALUES (?,?,?,?,?)",
                    (
                        identity(r["game_id"]),
                        identity(r["team_id"]),
                        aid,
                        year,
                        json.dumps(numeric_box(r, True)),
                    ),
                )
        elif dataset == "rosters":
            for r in rows:
                aid = identity(r["athlete_id"])
                conn.execute(
                    "INSERT OR REPLACE INTO bb_players VALUES (?,?,?)",
                    (aid, r.get("full_name") or aid, r.get("position_abbreviation")),
                )
                # Keep basketball-relevant profile fields; omit age and birth date.
                profile = {
                    k: v
                    for k, v in r.items()
                    if v
                    and k not in ["date_of_birth", "age", "guid", "uid", "headshot_alt"]
                }
                conn.execute(
                    "INSERT OR REPLACE INTO bb_rosters VALUES (?,?,?,?)",
                    (year, identity(r["team_id"]), aid, json.dumps(profile)),
                )
        elif dataset == "player_core":
            # ESPN-derived identity and roster context. Personal birth fields
            # and age are intentionally omitted from the public profile.
            keep = {
                "athlete_id", "guid", "uid", "slug", "type", "first_name",
                "last_name", "full_name", "display_name", "short_name",
                "height", "display_height", "weight", "display_weight",
                "jersey", "position_id", "position_name",
                "position_abbreviation", "position_display_name",
                "college_id", "current_team_id", "headshot_href",
                "experience_years", "status_id", "status_name", "status_type",
                "draft_year", "draft_round", "draft_selection", "active",
            }
            conn.execute(
                "DELETE FROM bb_unresolved WHERE dataset=? AND season=?",
                (dataset, year),
            )
            valid = []
            for i, r in enumerate(rows):
                if not r.get("athlete_id"):
                    conn.execute(
                        "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
                        (dataset, year, i, "Missing athlete ID", json.dumps(r)),
                    )
                    continue
                aid = identity(r["athlete_id"])
                name = r.get("display_name") or r.get("full_name") or aid
                conn.execute(
                    "INSERT OR REPLACE INTO bb_players VALUES (?,?,?)",
                    (aid, name, r.get("position_abbreviation") or r.get("position_id")),
                )
                profile = {k: v for k, v in r.items() if k in keep and v != ""}
                valid.append((year, aid, json.dumps(profile)))
            conn.executemany(
                "INSERT OR REPLACE INTO bb_player_core VALUES (?,?,?)", valid
            )
        elif dataset == "player_season":
            aggregates = defaultdict(dict)
            for r in rows:
                key = (identity(r["team_id"]), identity(r["athlete_id"]))
                category = aggregates[key].setdefault(r["category"], {})
                category[r["stat_name"]] = {
                    "value": number(r.get("value")),
                    "display": r.get("display_value"),
                    "label": r.get("stat_display_name"),
                    "description": r.get("stat_description"),
                }
            conn.executemany(
                "INSERT OR REPLACE INTO bb_player_season VALUES (?,?,?,?)",
                [(year, t, a, json.dumps(v)) for (t, a), v in aggregates.items()],
            )
        elif dataset == "team_season":
            aggregates = defaultdict(dict)
            profiles = {}
            for r in rows:
                tid = identity(r["team_id"])
                profiles[tid] = {
                    "name": r.get("team_display_name") or r.get("team_name") or tid,
                    "abbreviation": r.get("team_abbreviation"),
                }
                category = aggregates[tid].setdefault(r["category"], {})
                category[r["stat_name"]] = {
                    "value": number(r.get("value")),
                    "display": r.get("display_value"),
                    "label": r.get("stat_display_name"),
                    "description": r.get("stat_description"),
                }
            conn.executemany(
                "INSERT OR REPLACE INTO bb_team_season VALUES (?,?,?,?,?)",
                [
                    (
                        year,
                        tid,
                        profile["name"],
                        profile["abbreviation"],
                        json.dumps(aggregates[tid]),
                    )
                    for tid, profile in profiles.items()
                ],
            )
        elif dataset == "publisher_ratings":
            conn.executemany(
                "INSERT OR REPLACE INTO bb_publisher_ratings VALUES (?,?,?)",
                [
                    (year, identity(r["team_id"]), json.dumps({k: number(v) if number(v) is not None else v for k, v in r.items()}))
                    for r in rows
                ],
            )
        elif dataset == "publisher_player_value":
            conn.execute(
                "DELETE FROM bb_unresolved WHERE dataset=? AND season=?",
                (dataset, year),
            )
            valid = []
            for i, r in enumerate(rows):
                if not r.get("player_id") or not r.get("team_id"):
                    conn.execute(
                        "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
                        (dataset, year, i, "Missing player or team ID", json.dumps(r)),
                    )
                    continue
                valid.append(
                    (
                        year,
                        identity(r["player_id"]),
                        identity(r["team_id"]),
                        r.get("player"),
                        json.dumps({k: number(v) if number(v) is not None else v for k, v in r.items()}),
                    )
                )
            conn.executemany(
                "INSERT OR REPLACE INTO bb_player_value VALUES (?,?,?,?,?)", valid
            )
        elif dataset == "ncaa_lineups":
            grouped = {}
            sum_fields = {
                "duration_mins", "poss", "pts", "fga", "fgm", "rima", "rimm", "rim_ast",
                "mida", "midm", "mid_ast", "fg2a", "fg2m", "tpa", "tpm", "tp_ast",
                "fta", "ftm", "orb", "drb", "to", "stl", "blk", "ast", "foul",
                "opp_poss", "opp_pts", "opp_fga", "opp_fgm", "opp_rima", "opp_rimm",
                "opp_rim_ast", "opp_mida", "opp_midm", "opp_mid_ast", "opp_fg2a", "opp_fg2m",
                "opp_tpa", "opp_tpm", "opp_tp_ast", "opp_fta", "opp_ftm", "opp_orb",
                "opp_drb", "opp_to", "opp_stl", "opp_blk", "opp_ast", "opp_foul",
            }
            for r in rows:
                key = identity(r["lineup_key"])
                entry = grouped.setdefault(
                    key,
                    {
                        "team": r.get("team") or key,
                        "players": [r.get(f"player_{i}") for i in range(1, 6)],
                        "games": set(),
                        "stints": 0,
                        "totals": defaultdict(float),
                    },
                )
                if r.get("contest_id"):
                    entry["games"].add(identity(r["contest_id"]))
                entry["stints"] += 1
                for field in sum_fields:
                    value = number(r.get(field))
                    if value is not None:
                        entry["totals"][field] += value
            output = []
            for key, entry in grouped.items():
                totals = {k: round(v, 4) for k, v in entry["totals"].items()}
                totals["games"] = len(entry["games"])
                totals["stints"] = entry["stints"]
                totals["net_per_100"] = (
                    round(100 * (totals.get("pts", 0) / totals["poss"] - totals.get("opp_pts", 0) / totals["opp_poss"]), 4)
                    if totals.get("poss") and totals.get("opp_poss") else None
                )
                totals["plus_minus"] = round(totals.get("pts", 0) - totals.get("opp_pts", 0), 4)
                totals["off_rtg"] = round(100 * totals["pts"] / totals["poss"], 4) if totals.get("poss") else None
                totals["def_rtg"] = round(100 * totals["opp_pts"] / totals["opp_poss"], 4) if totals.get("opp_poss") else None
                output.append((year, key, entry["team"], json.dumps(entry["players"]), json.dumps(totals)))
            conn.executemany("INSERT OR REPLACE INTO bb_lineups VALUES (?,?,?,?,?)", output)
        elif dataset == "ncaa_rapm":
            conn.executemany(
                "INSERT OR REPLACE INTO bb_impact VALUES (?,?,?)",
                [(year, identity(r["player_id"]), json.dumps(r)) for r in rows],
            )
        elif dataset == "ncaa_player_box":
            conn.execute(
                "DELETE FROM bb_unresolved WHERE dataset=? AND season=?",
                (dataset, year),
            )
            metadata = {
                "game_date", "home", "away", "team", "player", "contest_id",
                "home_ncaa_team_id", "home_espn_team_id", "away_ncaa_team_id",
                "away_espn_team_id", "team_ncaa_team_id", "team_espn_team_id",
                "player_id", "clean_name", "espn_game_id", "season",
            }
            stat_fields = {
                "mins", "o_poss", "pts", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
                "ts_pct", "efg_pct", "fgm", "fga", "fg_pct", "tpm", "tpa", "tp_pct",
                "ftm", "fta", "ft_pct", "rimm", "rima", "rim_pct", "midm", "mida", "mid_pct",
                "pbackm", "pbacka", "pback_pct", "blk_rim", "blk_mid", "blk_three",
                "pct_fga_trans", "pct_tpa_trans", "pct_rima_trans", "pct_fgm_trans",
                "pct_tpm_trans", "pct_rimm_trans", "pct_fgm_ast", "pct_tpm_ast", "pct_rimm_ast",
                "pts_trans", "orb_trans", "drb_trans", "ast_trans", "stl_trans", "blk_trans", "tov_trans",
                "ts_pct_trans", "efg_pct_trans", "fgm_trans", "fga_trans", "fg_pct_trans", "tpm_trans",
                "tpa_trans", "tp_pct_trans", "ftm_trans", "fta_trans", "ft_pct_trans", "rimm_trans",
                "rima_trans", "rim_pct_trans", "midm_trans", "mida_trans", "mid_pct_trans",
                "pts_half", "orb_half", "drb_half", "ast_half", "stl_half", "blk_half", "tov_half",
                "ts_pct_half", "efg_pct_half", "fgm_half", "fga_half", "fg_pct_half", "tpm_half",
                "tpa_half", "tp_pct_half", "ftm_half", "fta_half", "ft_pct_half", "rimm_half", "rima_half",
                "rim_pct_half", "midm_half", "mida_half", "mid_pct_half", "pts_ast", "fgm_ast", "tpm_ast",
                "rimm_ast", "midm_ast", "pts_unast", "efg_pct_unast", "fgm_unast", "fga_unast", "fg_pct_unast",
                "tpm_unast", "tpa_unast", "tp_pct_unast", "rimm_unast", "rima_unast", "rim_pct_unast",
                "midm_unast", "mida_unast",
            }
            summary_fields = {
                "mins", "o_poss", "pts", "orb", "drb", "ast", "stl", "blk", "tov", "pf",
                "fgm", "fga", "tpm", "tpa", "ftm", "fta", "rimm", "rima", "midm", "mida",
                "pbackm", "pbacka", "pts_trans", "orb_trans", "drb_trans", "ast_trans",
                "stl_trans", "blk_trans", "tov_trans", "pts_half", "orb_half", "drb_half",
                "ast_half", "stl_half", "blk_half", "tov_half", "pts_ast", "fgm_ast", "tpm_ast",
                "rimm_ast", "midm_ast", "pts_unast", "fgm_unast", "fga_unast", "tpm_unast", "tpa_unast",
                "rimm_unast", "rima_unast", "midm_unast", "mida_unast",
            }
            valid = []
            season_totals = defaultdict(lambda: {"games": set(), "totals": defaultdict(float), "player_name": None, "team_name": None})
            for i, r in enumerate(rows):
                if not r.get("contest_id") or not r.get("team_ncaa_team_id") or not r.get("player_id"):
                    conn.execute(
                        "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
                        (dataset, year, i, "Missing contest, team or player ID", json.dumps(r)),
                    )
                    continue
                stats = {k: number(r.get(k)) for k in stat_fields if k in r}
                summary = season_totals[(identity(r["player_id"]), identity(r["team_ncaa_team_id"]))]
                summary["games"].add(identity(r["contest_id"]))
                summary["player_name"] = r.get("clean_name") or r.get("player")
                summary["team_name"] = r.get("team")
                for field in summary_fields:
                    value = number(r.get(field))
                    if value is not None:
                        summary["totals"][field] += value
                valid.append(
                    (
                        year,
                        identity(r["contest_id"]),
                        identity(r["team_ncaa_team_id"]),
                        identity(r["player_id"]),
                        r.get("game_date"),
                        r.get("team"),
                        r.get("away") if r.get("team") == r.get("home") else r.get("home"),
                        r.get("clean_name") or r.get("player"),
                        json.dumps(stats, separators=(",", ":")),
                    )
                )
            conn.executemany(
                "INSERT OR REPLACE INTO bb_ncaa_player_box VALUES (?,?,?,?,?,?,?,?,?)",
                valid,
            )
            conn.executemany(
                "INSERT OR REPLACE INTO bb_ncaa_player_season VALUES (?,?,?,?,?,?,?)",
                [
                    (
                        year, player_id, team_id, entry["player_name"], entry["team_name"],
                        len(entry["games"]),
                        json.dumps({k: round(v, 4) for k, v in entry["totals"].items()}, separators=(",", ":")),
                    )
                    for (player_id, team_id), entry in season_totals.items()
                ],
            )
        elif dataset == "ncaa_team_rosters":
            conn.execute(
                "DELETE FROM bb_unresolved WHERE dataset=? AND season=?",
                (dataset, year),
            )
            valid = []
            keep = {
                "season", "team_id", "team", "player_id", "player", "clean_name", "name",
                "jersey", "class", "position", "height", "ht_inches", "hometown", "high_school", "gp", "gs",
            }
            for i, r in enumerate(rows):
                if not r.get("team_id") or not r.get("player_id"):
                    conn.execute(
                        "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
                        (dataset, year, i, "Missing NCAA team or player ID", json.dumps(r)),
                    )
                    continue
                profile = {k: r.get(k) for k in keep if r.get(k) not in (None, "")}
                valid.append(
                    (
                        year,
                        identity(r["team_id"]),
                        identity(r["player_id"]),
                        r.get("team"),
                        r.get("clean_name") or r.get("name") or r.get("player"),
                        json.dumps(profile, separators=(",", ":")),
                    )
                )
            conn.executemany(
                "INSERT OR REPLACE INTO bb_ncaa_rosters VALUES (?,?,?,?,?,?)",
                valid,
            )
        elif dataset == "ncaa_shots":
            conn.execute(
                "DELETE FROM bb_unresolved WHERE dataset=? AND season=?",
                (dataset, year),
            )
            groups = defaultdict(lambda: {
                "player_name": None, "team_name": None, "attempts": 0,
                "makes": 0, "points": 0, "distance_sum": 0.0,
                "distance_count": 0, "zones": defaultdict(lambda: {"attempts": 0, "makes": 0, "points": 0}),
                "types": defaultdict(lambda: {"attempts": 0, "makes": 0, "points": 0}),
            })
            for i, r in enumerate(rows):
                if not r.get("shooter_player_id") or not r.get("ncaa_team_id"):
                    conn.execute(
                        "INSERT INTO bb_unresolved VALUES (?,?,?,?,?)",
                        (dataset, year, i, "Missing NCAA shooter or team ID", json.dumps(r)),
                    )
                    continue
                key = (identity(r["shooter_player_id"]), identity(r["ncaa_team_id"]))
                entry = groups[key]
                entry["player_name"] = r.get("shooter_clean_name") or r.get("shooter_id")
                entry["team_name"] = r.get("team") or r.get("team_id")
                made_value = r.get("made")
                made = made_value is True or made_value == 1 or str(made_value).lower() == "true"
                points = number(r.get("point_value")) or 0
                entry["attempts"] += 1
                entry["makes"] += int(made)
                entry["points"] += points
                distance = number(r.get("dist_ft"))
                if distance is not None:
                    entry["distance_sum"] += distance
                    entry["distance_count"] += 1
                for bucket, value in (("zones", r.get("shot_zone") or "unknown"), ("types", r.get("shot_type") or "unknown")):
                    item = entry[bucket][value]
                    item["attempts"] += 1
                    item["makes"] += int(made)
                    item["points"] += points
            conn.executemany(
                "INSERT OR REPLACE INTO bb_ncaa_player_shooting VALUES (?,?,?,?,?,?)",
                [
                    (
                        year, player_id, team_id, entry["player_name"], entry["team_name"],
                        json.dumps({
                            "attempts": entry["attempts"], "makes": entry["makes"], "points": entry["points"],
                            "distance_sum": round(entry["distance_sum"], 4), "distance_count": entry["distance_count"],
                            "zones": entry["zones"], "types": entry["types"],
                        }, separators=(",", ":")),
                    )
                    for (player_id, team_id), entry in groups.items()
                ],
            )
        if dataset in ["participation", "player_box"]:
            conn.execute("DELETE FROM bb_participation WHERE season=?", (year,))
            observed = defaultdict(dict)
            for r in rows:
                if (
                    r.get("athlete_id")
                    and (number(r.get("minutes")) or 0) > 0
                    and r.get("did_not_play") != "true"
                ):
                    observed[(identity(r["team_id"]), identity(r["athlete_id"]))][
                        identity(r["game_id"])
                    ] = r
            conn.executemany(
                "INSERT INTO bb_participation VALUES (?,?,?,?,?,?)",
                [
                    (
                        year,
                        t,
                        a,
                        next(iter(g.values())).get("athlete_display_name", a),
                        len(g),
                        sum(number(r["minutes"]) for r in g.values()),
                    )
                    for (t, a), g in observed.items()
                ],
            )


def load_games(conn):
    games = [
        dict(g) for g in conn.execute("SELECT * FROM bb_games ORDER BY starts_at,id")
    ]
    boxes = {
        (r["game_id"], r["team_id"]): json.loads(r["stats_json"])
        for r in conn.execute("SELECT * FROM bb_team_box")
    }
    complete = [g for g in games if g["completed"]]
    valid = [f for g in complete if (f := game_features(g, boxes)) is not None]
    return games, boxes, valid


def _prior_production(rows):
    """Summarize recorded prior-season stints without implying a new-school role."""
    if not rows:
        return None
    games = sum(int(row.get("games") or 0) for row in rows)
    minutes = sum(float(row.get("minutes") or 0) for row in rows)
    if games <= 0 and minutes <= 0:
        return None

    def weighted(key):
        values = [
            (float(row[key]), int(row.get("games") or 0))
            for row in rows
            if row.get(key) is not None and int(row.get("games") or 0) > 0
        ]
        return sum(value * weight for value, weight in values) / sum(
            weight for _, weight in values
        ) if values else None

    rate_values = {
        key: weighted(key)
        for key in (
            "ppg",
            "rpg",
            "apg",
            "spg",
            "bpg",
            "topg",
            "efg",
            "ts",
            "three_pct",
            "ft_rate",
            "three_rate",
            "tov_rate",
        )
    }
    result = {
        "games": games,
        "minutes": round(minutes, 1),
        "mpg": round(minutes / games, 1) if games else None,
        "qualified": all(
            rate_values[key] is not None
            for key in ("ppg", "rpg", "apg", "efg", "ts")
        ),
        "teams": sorted({row["team"] for row in rows if row.get("team")}),
    }
    for key, value in rate_values.items():
        result[key] = (
            round(
                value,
                3
                if key
                in {"efg", "ts", "three_pct", "ft_rate", "three_rate", "tov_rate"}
                else 1,
            )
            if value is not None
            else None
        )
    return result


def roster_changes(conn, target=2027, prior_players=None):
    prior = defaultdict(list)
    current = defaultdict(list)
    teams = {}
    unusable_rows = 0
    for g in conn.execute("SELECT * FROM bb_games ORDER BY season"):
        teams[g["home_id"]] = g["home_name"]
        teams[g["away_id"]] = g["away_name"]
    for r in conn.execute(
        "SELECT * FROM bb_participation WHERE season=?", (target - 1,)
    ):
        prior[r["athlete_id"]].append({"team_id": r["team_id"], "full_name": r["name"]})
    for r in conn.execute(
        "SELECT * FROM bb_rosters WHERE season IN (?,?)", (target - 1, target)
    ):
        p = json.loads(r["profile_json"])
        # ESPN occasionally emits a team-attributed roster row with an athlete
        # ID and the display name "Team". Keep the raw row in the warehouse,
        # but never present it as a player identity in the public derivative.
        if not (p.get("full_name") or "").strip() or (p.get("full_name") or "").strip().casefold() == "team":
            if r["season"] == target:
                unusable_rows += 1
            continue
        p["team_id"] = r["team_id"]
        p["athlete_id"] = r["athlete_id"]
        if r["season"] == target:
            current[r["athlete_id"]].append(p)
        teams[r["team_id"]] = p.get("team_display_name", r["team_id"])
    prior_production = defaultdict(list)
    for player in (prior_players or {}).get("players", []):
        prior_production[player["id"]].append(player)
    if target == 2026:
        current = defaultdict(list)
        for r in conn.execute(
            "SELECT * FROM bb_participation WHERE season=?", (target,)
        ):
            current[r["athlete_id"]].append(
                {
                    "team_id": r["team_id"],
                    "athlete_id": r["athlete_id"],
                    "full_name": r["name"],
                }
            )
    observed = []
    for aid, profiles in current.items():
        old = prior.get(aid, [])
        new_ids = {p["team_id"] for p in profiles}
        old_ids = {p["team_id"] for p in old}
        if len(new_ids) > 1:
            status = "ambiguous"
        elif new_ids & old_ids:
            status = "same_program"
        elif old_ids:
            status = "different_program"
        else:
            status = "new_to_dataset"
        for p in profiles:
            observed.append(
                {
                    "id": aid,
                    "name": p.get("full_name", aid),
                    "team_id": p["team_id"],
                    "team": teams[p["team_id"]],
                    "previous_teams": [teams.get(t, t) for t in sorted(old_ids)],
                    "status": status,
                    "position": p.get("position_abbreviation"),
                    "class_year": p.get("experience_display_value"),
                    "height": p.get("height"),
                    "weight": p.get("weight"),
                    "source_url": p.get("link_web"),
                    "prior_production": _prior_production(prior_production.get(aid)),
                }
            )
    # Keep a team-level workload view beside the player observations. These
    # values are descriptive: an observed listing does not prove eligibility,
    # availability or a future rotation role.
    prior_minutes_by_team = defaultdict(float)
    prior_player_minutes = {}
    for player in (prior_players or {}).get("players", []):
        team_id = str(player.get("team_id")) if player.get("team_id") is not None else None
        player_id = str(player.get("id")) if player.get("id") is not None else None
        minutes = float(player.get("minutes") or 0)
        if not team_id or not player_id or minutes < 0:
            continue
        prior_minutes_by_team[team_id] += minutes
        prior_player_minutes[(player_id, team_id)] = prior_player_minutes.get((player_id, team_id), 0.0) + minutes
    team_rows = defaultdict(list)
    for row in observed:
        team_rows[str(row["team_id"])].append(row)
    team_summaries = []
    for team_id, rows in team_rows.items():
        returning = [r for r in rows if r["status"] == "same_program"]
        transfers = [r for r in rows if r["status"] == "different_program"]
        new = [r for r in rows if r["status"] == "new_to_dataset"]
        ambiguous = [r for r in rows if r["status"] == "ambiguous"]
        returning_minutes = sum(prior_player_minutes.get((str(r["id"]), team_id), 0.0) for r in returning)
        incoming_minutes = sum(
            sum(float(p.get("minutes") or 0) for p in prior_production.get(str(r["id"]), []))
            for r in transfers
        )
        represented = returning_minutes + incoming_minutes
        prior_minutes = prior_minutes_by_team.get(team_id, 0.0)
        team_summaries.append(
            {
                "team_id": team_id,
                "team": teams.get(team_id, team_id),
                "listed_players": len(rows),
                "returning_players": len(returning),
                "transfer_players": len(transfers),
                "new_players": len(new),
                "ambiguous_players": len(ambiguous),
                "prior_minutes": round(prior_minutes, 1),
                "returning_minutes": round(returning_minutes, 1),
                "incoming_prior_minutes": round(incoming_minutes, 1),
                "represented_prior_minutes": round(represented, 1),
                "returning_minutes_share": round(returning_minutes / prior_minutes, 4) if prior_minutes else None,
                "represented_prior_minutes_share": round(represented / prior_minutes, 4) if prior_minutes else None,
            }
        )
    return {
        "season": target,
        "previous_season": target - 1,
        "basis": "Prior-season recorded appearances versus "
        + (
            "recorded appearances"
            if target == 2026
            else "unconfirmed source roster listings"
        ),
        "teams_observed": len({p["team_id"] for p in observed}),
        "players_observed": len(current),
        "unusable_rows": unusable_rows,
        "prior_players_not_observed": len(set(prior) - set(current)),
        "status_counts": dict(Counter(p["status"] for p in observed)),
        "team_summaries": sorted(team_summaries, key=lambda p: p["team"]),
        "players": sorted(observed, key=lambda p: p["name"]),
    }


def player_index(conn, year=2026):
    totals = {}
    observed_games = set()
    for r in conn.execute(
        "SELECT p.* FROM bb_player_box p JOIN bb_games g ON g.id=p.game_id WHERE p.season=? AND g.completed=1",
        (year,),
    ):
        b = json.loads(r["stats_json"])
        if b["did_not_play"] == "true" or b["minutes"] is None or b["minutes"] <= 0:
            continue
        key = (r["athlete_id"], r["team_id"])
        observed_games.add(r["game_id"])
        t = totals.setdefault(
            key,
            {"games": 0, **{k: 0.0 for k in STAT_FIELDS}, "incomplete_box_games": 0},
        )
        t["games"] += 1
        for k in STAT_FIELDS:
            if b[k] is not None:
                t[k] += b[k]
        if any(b[k] is None for k in STAT_FIELDS):
            t["incomplete_box_games"] += 1
    names = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM bb_players")}
    team_names = {
        tid: g[name]
        for g in conn.execute("SELECT * FROM bb_games ORDER BY season")
        for tid, name in [(g["home_id"], "home_name"), (g["away_id"], "away_name")]
    }
    result = []
    for (aid, tid), t in totals.items():
        p = names.get(aid, {"name": aid, "position": None})
        games = t["games"]
        fga = t["field_goals_attempted"]
        fta = t["free_throws_attempted"]
        result.append(
            {
                "id": aid,
                "team_id": tid,
                "name": p["name"],
                "position": p["position"],
                "team": team_names.get(tid, tid),
                "season": year,
                "games": games,
                "minutes": round(t["minutes"], 1),
                "mpg": round(t["minutes"] / games, 1),
                "ppg": round(t["points"] / games, 1),
                "rpg": round(t["rebounds"] / games, 1),
                "apg": round(t["assists"] / games, 1),
                "spg": round(t["steals"] / games, 1),
                "bpg": round(t["blocks"] / games, 1),
                "topg": round(t["turnovers"] / games, 1),
                "efg": ratio(
                    t["field_goals_made"] + 0.5 * t["three_point_field_goals_made"], fga
                ),
                "ts": ratio(t["points"], 2 * (fga + 0.475 * fta)),
                "three_pct": ratio(
                    t["three_point_field_goals_made"],
                    t["three_point_field_goals_attempted"],
                ),
                "ft_rate": ratio(t["free_throws_attempted"], fga),
                "three_rate": ratio(t["three_point_field_goals_attempted"], fga),
                "tov_rate": ratio(
                    t["turnovers"], fga + 0.475 * fta + t["turnovers"]
                ),
                "qualified": t["minutes"] >= 400
                and games >= 15
                and t["incomplete_box_games"] == 0,
                "incomplete_box_games": t["incomplete_box_games"],
            }
        )
    # Do not present incomplete box sums as complete season rates.
    for p in result:
        if p["incomplete_box_games"]:
            for k in [
                "ppg",
                "rpg",
                "apg",
                "spg",
                "bpg",
                "topg",
                "efg",
                "ts",
                "three_pct",
                "ft_rate",
                "three_rate",
                "tov_rate",
            ]:
                p[k] = None
    result.sort(key=lambda p: (-(p["ppg"] or 0), p["name"]))
    return {"season": year, "players": result, "box_games": len(observed_games)}


def publisher_leaders(conn, year=2026, limit=10):
    """Rank comparable numeric fields from the attributed publisher release.

    The source's season aggregates are retained verbatim in D1. This derivative
    only adds a stable player/team label, a conservative game threshold, and
    tie-aware ranks; it does not reinterpret the publisher's formulas.
    """
    names = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM bb_players")}
    team_names = {
        tid: g[name]
        for g in conn.execute("SELECT * FROM bb_games ORDER BY season")
        for tid, name in [(g["home_id"], "home_name"), (g["away_id"], "away_name")]
    }
    for r in conn.execute("SELECT * FROM bb_rosters WHERE season=?", (year,)):
        profile = json.loads(r["profile_json"])
        team_names[r["team_id"]] = profile.get(
            "team_display_name", team_names.get(r["team_id"], r["team_id"])
        )
    by_metric = defaultdict(list)
    descriptions = {}
    rows = conn.execute(
        "SELECT team_id,athlete_id,stats_json FROM bb_player_season WHERE season=?",
        (year,),
    )
    for row in rows:
        source = json.loads(row["stats_json"])
        averages = source.get("averages", {})
        games = number((averages.get("gamesPlayed") or {}).get("value"))
        if games is None or games < 15:
            continue
        player = names.get(row["athlete_id"], {"name": row["athlete_id"], "position": None})
        for key, category, stat, label, unit in PUBLISHER_LEADER_SPECS:
            value = (source.get(category, {}).get(stat) or {}).get("value")
            value = number(value)
            if value is None:
                continue
            detail = source[category][stat]
            descriptions.setdefault(key, detail.get("description"))
            by_metric[key].append(
                {
                    "id": row["athlete_id"],
                    "name": player["name"],
                    "position": player.get("position"),
                    "team_id": row["team_id"],
                    "team": team_names.get(row["team_id"], row["team_id"]),
                    "games": int(games) if games.is_integer() else games,
                    "value": value,
                    "display": detail.get("display") or str(value),
                }
            )
    metrics = []
    for key, category, stat, label, unit in PUBLISHER_LEADER_SPECS:
        ranked = sorted(
            by_metric[key],
            key=lambda row: (-row["value"], row["name"], row["team"]),
        )[:limit]
        previous = None
        rank = 0
        for index, row in enumerate(ranked):
            if row["value"] != previous:
                rank = index + 1
            row["rank"] = rank
            previous = row["value"]
        metrics.append(
            {
                "key": key,
                "category": category,
                "stat": stat,
                "label": label,
                "unit": unit,
                "description": descriptions.get(key),
                "leaders": ranked,
            }
        )
    return {
        "season": year,
        "minimum_games": 15,
        "source": "SportsDataverse attributed player-season statistics",
        "metrics": metrics,
    }


FACTOR_FIELDS = ("efg", "tov", "orb", "ftr")


def matchup_factor_edges(home_id, away_id, ratings, season):
    """Explain a matchup with opponent-adjusted four-factor edges.

    ``home`` and ``away`` retain the underlying attack and defense rates so
    the UI can show its work.  ``edges`` are signed in home-team terms: a
    positive number means the home side has the cleaner factor matchup.  For
    turnover rate, lower offensive turnover rate and higher defensive pressure
    are favorable, so that factor uses the inverse sign convention.
    """
    home = ratings.get(home_id)
    away = ratings.get(away_id)
    if home is None or away is None:
        return None
    factors = {}
    edges = {}
    for key in FACTOR_FIELDS:
        home_off = home.get(f"adj_off_{key}")
        home_def = home.get(f"adj_def_{key}")
        away_off = away.get(f"adj_off_{key}")
        away_def = away.get(f"adj_def_{key}")
        if any(value is None for value in (home_off, home_def, away_off, away_def)):
            continue
        factors[key] = {
            "home_offense": round(float(home_off), 4),
            "home_defense": round(float(home_def), 4),
            "away_offense": round(float(away_off), 4),
            "away_defense": round(float(away_def), 4),
        }
        if key == "tov":
            home_edge = (away_def - home_off) - (home_def - away_off)
        else:
            home_edge = (home_off - away_def) - (away_off - home_def)
        edges[key] = round(float(home_edge), 4)
    if not factors:
        return None
    return {"season": season, "factors": factors, "edges": edges}


def _factor_values(game, boxes):
    """Return each side's four-factor rates when both boxes support them."""
    features = game_features(game, boxes)
    if features is None:
        return None
    result = {}
    for own, opp in (("home", "away"), ("away", "home")):
        box = boxes.get((game["id"], game[f"{own}_id"]))
        other = boxes.get((game["id"], game[f"{opp}_id"]))
        if box is None or other is None:
            return None
        fga = box.get("field_goals_attempted")
        fg = box.get("field_goals_made")
        threes = box.get("three_point_field_goals_made")
        fta = box.get("free_throws_attempted")
        turnovers = box.get("turnovers")
        orb = box.get("offensive_rebounds")
        opp_drb = other.get("defensive_rebounds")
        opp_fga = other.get("field_goals_attempted")
        opp_fg = other.get("field_goals_made")
        opp_threes = other.get("three_point_field_goals_made")
        opp_fta = other.get("free_throws_attempted")
        opp_turnovers = other.get("turnovers")
        opp_orb = other.get("offensive_rebounds")
        drb = box.get("defensive_rebounds")
        values = {
            "efg": ratio(fg + 0.5 * threes, fga)
            if all(v is not None for v in (fg, threes, fga))
            else None,
            "tov": ratio(turnovers, features["possessions"])
            if turnovers is not None
            else None,
            "orb": ratio(orb, orb + opp_drb)
            if orb is not None and opp_drb is not None
            else None,
            "ftr": ratio(fta, fga)
            if fta is not None and fga is not None
            else None,
        }
        opponent_values = {
            "efg": ratio(opp_fg + 0.5 * opp_threes, opp_fga)
            if all(v is not None for v in (opp_fg, opp_threes, opp_fga))
            else None,
            "tov": ratio(opp_turnovers, features["possessions"])
            if opp_turnovers is not None
            else None,
            "orb": ratio(opp_orb, opp_orb + drb)
            if opp_orb is not None and drb is not None
            else None,
            "ftr": ratio(opp_fta, opp_fga)
            if opp_fta is not None and opp_fga is not None
            else None,
        }
        result[own] = values
        result[opp] = opponent_values
    return result


def adjusted_factor_ratings(model, games, boxes, season):
    """Fit opponent-adjusted offensive and defensive four-factor rates.

    Each factor uses the same team/venue design as the efficiency model, with
    season recency weights. Missing box components remove only that factor's
    game; no missing value is imputed to zero.
    """
    teams = model["teams"]
    index = {tid: i for i, tid in enumerate(teams)}
    n = len(teams)
    by_factor = {key: [] for key in FACTOR_FIELDS}
    for game in games:
        if not game["completed"] or game["season"] > season:
            continue
        if game["home_id"] not in index or game["away_id"] not in index:
            continue
        values = _factor_values(game, boxes)
        if values is None:
            continue
        for key in FACTOR_FIELDS:
            if values["home"].get(key) is None or values["away"].get(key) is None:
                continue
            by_factor[key].append((game, values["home"][key], values["away"][key]))

    def fit_factor(pairs):
        if len(pairs) < 30:
            return None
        x = np.zeros((2 * len(pairs), 2 + 2 * n))
        y = []
        weights = []
        for i, (game, home_value, away_value) in enumerate(pairs):
            h, a = index[game["home_id"]], index[game["away_id"]]
            venue = 0 if game["neutral"] else 0.5
            for j, (own, opp, sign, value) in enumerate(
                [(h, a, 1, home_value), (a, h, -1, away_value)]
            ):
                x[2 * i + j, 0] = 1
                x[2 * i + j, 1] = venue * sign
                x[2 * i + j, 2 + own] = 1
                x[2 * i + j, 2 + n + opp] = 1
                y.append(value)
            weights.append(0.6 ** (season - game["season"]))
        regularizer = np.eye(x.shape[1]) * 12
        regularizer[0, 0] = 0
        coef = np.linalg.solve(
            x.T @ (np.repeat(weights, 2)[:, None] * x) + regularizer,
            x.T @ (np.repeat(weights, 2) * np.asarray(y)),
        )
        return coef

    fitted = {key: fit_factor(pairs) for key, pairs in by_factor.items()}
    result = {tid: {} for tid in teams}
    for key, coef in fitted.items():
        if coef is None:
            continue
        for tid, i in index.items():
            result[tid][f"adj_off_{key}"] = float(coef[0] + coef[i + 2])
            result[tid][f"adj_def_{key}"] = float(coef[0] + coef[i + n + 2])
    return result


def team_ratings(model, games, boxes, season):
    names = {
        tid: g[name]
        for g in games
        for tid, name in [(g["home_id"], "home_name"), (g["away_id"], "away_name")]
    }
    stats = defaultdict(lambda: defaultdict(float))
    opponents = defaultdict(list)
    for g in games:
        if not g["completed"] or g["season"] != season:
            continue
        features = game_features(g, boxes)
        if features is None:
            continue
        for own, opp in [("home", "away"), ("away", "home")]:
            tid = g[f"{own}_id"]
            oid = g[f"{opp}_id"]
            t = stats[tid]
            b = boxes[(g["id"], tid)]
            ob = boxes[(g["id"], oid)]
            t["games"] += 1
            t["points"] += g[f"{own}_score"]
            t["allowed"] += g[f"{opp}_score"]
            t["possessions"] += features["possessions"]
            t["pace_sum"] += features["pace"]
            t["wins"] += g[f"{own}_score"] > g[f"{opp}_score"]
            prediction = forecast(model, g)
            if prediction is not None:
                t["expected_wins"] += (
                    prediction["home_win_probability"]
                    if own == "home"
                    else 1 - prediction["home_win_probability"]
                )
                t["expected_games"] += 1
            opponents[tid].append(oid)
            for k in [
                "field_goals_made",
                "field_goals_attempted",
                "three_point_field_goals_made",
                "three_point_field_goals_attempted",
                "free_throws_attempted",
                "offensive_rebounds",
                "turnovers",
            ]:
                if b.get(k) is None:
                    t["missing"] += 1
                else:
                    t[k] += b[k]
            if ob.get("defensive_rebounds") is None:
                t["missing"] += 1
            else:
                t["opp_drb"] += ob["defensive_rebounds"]
    b = model["efficiency"]
    tempo = model["tempo"]
    n = len(model["teams"])
    factor_ratings = adjusted_factor_ratings(model, games, boxes, season)
    ratings = []
    net = {tid: b[i + 2] - b[i + n + 2] for i, tid in enumerate(model["teams"])}
    for i, tid in enumerate(model["teams"]):
        s = stats[tid]
        fg = s["field_goals_attempted"]
        poss = s["possessions"]
        op = [net[o] for o in opponents[tid] if o in net]
        ratings.append(
            {
                "id": tid,
                "name": names.get(tid, tid),
                "adj_off": round(b[0] + b[i + 2], 2),
                "adj_def": round(b[0] + b[i + n + 2], 2),
                "adj_net": round(net[tid], 2),
                "adj_tempo": round(tempo[0] + tempo[i + 1], 2),
                "games": int(s["games"]),
                "wins": int(s["wins"]),
                "expected_wins": round(s["expected_wins"], 2)
                if s["expected_games"]
                else None,
                "luck": round(
                    100
                    * (s["wins"] - s["expected_wins"])
                    / s["expected_games"],
                    2,
                )
                if s["expected_games"]
                else None,
                "luck_games": int(s["expected_games"]),
                "sos": round(sum(op) / len(op), 2) if op else None,
                "sos_games": len(op),
                "efg": ratio(
                    s["field_goals_made"] + 0.5 * s["three_point_field_goals_made"], fg
                )
                if not s["missing"]
                else None,
                "tov_rate": ratio(s["turnovers"], poss) if not s["missing"] else None,
                "orb_rate": ratio(
                    s["offensive_rebounds"], s["offensive_rebounds"] + s["opp_drb"]
                )
                if not s["missing"]
                else None,
                "ft_rate": ratio(s["free_throws_attempted"], fg)
                if not s["missing"]
                else None,
                "three_rate": ratio(s["three_point_field_goals_attempted"], fg)
                if not s["missing"]
                else None,
                **{
                    key: round(value, 4)
                    for key, value in factor_ratings.get(tid, {}).items()
                },
            }
        )
    ratings.sort(key=lambda t: -t["adj_net"])
    for i, t in enumerate(ratings):
        t["rank"] = i + 1
    return ratings


def build(conn, target=2027):
    now = utcnow()
    games, boxes, valid = load_games(conn)
    model = train(valid, now, target)
    ratings = team_ratings(model, games, boxes, target - 1)
    rating_by_id = {rating["id"]: rating for rating in ratings}
    upcoming = []
    for g in games:
        if g["season"] == target and not g["completed"] and g["starts_at"] > now:
            p = forecast(model, g)
            cold_start = fallback_forecast(model, g) if p is None else None
            factors = matchup_factor_edges(
                g["home_id"], g["away_id"], rating_by_id, target - 1
            )
            upcoming.append(
                {
                    **g,
                    "prediction": p,
                    "fallback_prediction": cold_start,
                    "matchup_factors": factors,
                }
            )
            if p:
                conn.execute(
                    "INSERT OR IGNORE INTO bb_forecasts VALUES (?,?,?,?)",
                    (g["id"], model["id"], now, json.dumps(p)),
                )
    conn.execute(
        "INSERT OR IGNORE INTO bb_models VALUES (?,?,?)",
        (model["id"], now, json.dumps(model)),
    )
    sources = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT receipt_json FROM bb_sources ORDER BY season,dataset"
        )
    ]
    overview = {
        "season": target,
        "label": f"{target - 1}–{str(target)[-2:]}",
        "generated_at": now,
        "attribution": BASKETBALL_ATTRIBUTION,
        "coverage": {
            "schedule_records": len(games),
            "completed_games": sum(g["completed"] for g in games),
            "paired_box_games": len(valid),
            "unusable_completed_games": sum(g["completed"] for g in games) - len(valid),
            "player_box_rows": conn.execute(
                "SELECT count(*) FROM bb_player_box"
            ).fetchone()[0],
            "unresolved_rows": conn.execute(
                "SELECT count(*) FROM bb_unresolved"
            ).fetchone()[0],
            "upcoming_games": len(upcoming),
            "forecast_games": sum(g["prediction"] is not None for g in upcoming),
            "baseline_estimate_games": sum(
                g["fallback_prediction"] is not None for g in upcoming
            ),
        },
        "model": model,
        "upcoming": upcoming,
        "ratings": ratings,
        "sources": sources,
    }
    impact = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT data_json FROM bb_impact WHERE season=?", (target - 1,)
        )
    ]
    for r in impact:
        for k in ["orapm", "drapm", "rapm_net", "off_poss", "def_poss"]:
            r[k] = number(r.get(k))
        r["qualified"] = (r["off_poss"] or 0) >= 500 and (r["def_poss"] or 0) >= 500
    impact.sort(key=lambda r: -(r["rapm_net"] if r["rapm_net"] is not None else -999))
    rank = 0
    for r in impact:
        if r["qualified"]:
            rank += 1
            r["rank"] = rank
        else:
            r["rank"] = None
    season_players = player_index(conn, target - 1)
    artifacts = {
        "overview": overview,
        "players": season_players,
        "publisher-leaders": publisher_leaders(conn, target - 1),
        "rosters": roster_changes(conn, target, season_players),
        "rosters-2026": roster_changes(conn, 2026, player_index(conn, 2025)),
        "impact": {
            "season": target - 1,
            "players": impact,
            "identity_note": "NCAA source IDs; no unverified name-only join to ESPN identities.",
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in artifacts.items():
        (OUT / f"{name}.json").write_text(
            json.dumps(data, separators=(",", ":"), allow_nan=False)
        )
    conn.commit()
    print(
        json.dumps(
            {
                "coverage": overview["coverage"],
                "evaluation": model["evaluation"],
                "calibration": model["calibration"],
                "rated_teams": len(model["teams"]),
                "players": len(artifacts["players"]["players"]),
                "rosters": {
                    k: v for k, v in artifacts["rosters"].items() if k != "players"
                },
            },
            indent=2,
        ),
        flush=True,
    )


def export_sql(conn, path):
    # The full fitted model is already published in overview.json and is not
    # queried by the Worker. Its JSON blob is over D1's per-statement limit on
    # current editions, so keep the D1 table available without replaying it.
    # This leaves the compact research tables importable and avoids a failed
    # all-or-nothing import when the model grows.
    excluded_tables = {"bb_models", "bb_ncaa_player_box"}
    with path.open("w") as f:
        for table in [
            "bb_games",
            "bb_team_box",
            "bb_player_box",
            "bb_player_season",
            "bb_team_season",
            "bb_publisher_ratings",
            "bb_player_value",
            "bb_lineups",
            "bb_player_core",
            "bb_rosters",
            "bb_impact",
            "bb_ncaa_player_season",
            "bb_ncaa_rosters",
            "bb_ncaa_player_shooting",
            "bb_unresolved",
            "bb_participation",
        ]:
            for row in conn.execute(f"SELECT DISTINCT season FROM {table}"):
                f.write(f"DELETE FROM {table} WHERE season={int(row[0])};\n")
        for line in conn.iterdump():
            if line.startswith("INSERT INTO") and not any(
                line.startswith(f'INSERT INTO "{table}"') for table in excluded_tables
            ):
                f.write(line.replace("INSERT INTO", "INSERT OR REPLACE INTO", 1) + "\n")


def export_ncaa_player_box_sql(conn, path, season=2026):
    """Export only the current NCAA game rows; historical seasons use summaries."""
    with path.open("w") as f:
        f.write(f"DELETE FROM bb_ncaa_player_box WHERE season={int(season)};\n")
        for row in conn.execute(
            "SELECT season,contest_id,team_id,player_id,game_date,team_name,opponent_name,player_name,stats_json FROM bb_ncaa_player_box WHERE season=?",
            (season,),
        ):
            values = []
            for value in row:
                if value is None:
                    values.append("NULL")
                else:
                    values.append("'" + str(value).replace("'", "''") + "'")
            f.write("INSERT OR REPLACE INTO bb_ncaa_player_box VALUES (" + ",".join(values) + ");\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--sql", type=Path)
    args = parser.parse_args()
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    for migration in ("0009_basketball_research.sql", "0017_basketball_team_season.sql", "0018_basketball_boutique.sql", "0019_basketball_lineups.sql", "0020_basketball_player_core.sql", "0021_basketball_ncaa_player_box.sql", "0022_basketball_ncaa_rosters.sql", "0023_basketball_ncaa_shooting.sql"):
        conn.executescript((ROOT / "worker/migrations" / migration).read_text())
    if not args.build_only:
        c = client()
        for year in [2024, 2025, 2026, 2027]:
            datasets = (
                ["schedule", "team_box", "player_box"]
                if year < 2026
                else (
                    [
                        "schedule",
                        "team_box",
                        "rosters",
                        "player_box",
                        "player_season",
                        "ncaa_rapm",
                    ]
                    if year == 2026
                    else ["schedule", "rosters"]
                )
            )
            # The publisher's player-season release begins in 2025. Keep the
            # 2024 box-score archive intact while importing every available
            # attributed season into the source-stat browser.
            if year == 2025:
                datasets.append("player_season")
            if year in (2024, 2025, 2026):
                datasets.append("team_season")
                datasets.extend(["publisher_ratings", "publisher_player_value"])
                datasets.append("player_core")
            if 2019 <= year <= 2026:
                datasets.append("ncaa_lineups")
            for dataset in datasets:
                rows, receipt = c.load(dataset, year, refresh=args.refresh)
                ingest(conn, dataset, year, rows, receipt)
                print(f"Imported {dataset}/{year}: {len(rows):,}", flush=True)
        # The boutique publisher model releases extend back to 2006. Keep
        # those compact historical tables complete without expanding the
        # schedule/box-score training archive in this refresh.
        for year in range(2006, 2024):
            for dataset in ("publisher_ratings", "publisher_player_value"):
                rows, receipt = c.load(dataset, year, refresh=args.refresh)
                ingest(conn, dataset, year, rows, receipt)
                print(f"Imported {dataset}/{year}: {len(rows):,}", flush=True)
        # ESPN-derived player identity files extend back to 2003. They are
        # kept separate from box-score identity and do not alter model inputs.
        for year in range(2003, 2024):
            rows, receipt = c.load("player_core", year, refresh=args.refresh)
            ingest(conn, "player_core", year, rows, receipt)
            print(f"Imported player_core/{year}: {len(rows):,}", flush=True)
        # NCAA-derived advanced player box scores begin in 2010. Their player
        # IDs are intentionally kept in a separate namespace from ESPN.
        for year in range(2010, 2027):
            rows, receipt = c.load("ncaa_player_box", year, refresh=args.refresh)
            ingest(conn, "ncaa_player_box", year, rows, receipt)
            print(f"Imported ncaa_player_box/{year}: {len(rows):,}", flush=True)
            rows, receipt = c.load("ncaa_team_rosters", year, refresh=args.refresh)
            ingest(conn, "ncaa_team_rosters", year, rows, receipt)
            print(f"Imported ncaa_team_rosters/{year}: {len(rows):,}", flush=True)
            if 2019 <= year <= 2026:
                rows, receipt = c.load("ncaa_shots", year, refresh=args.refresh)
                ingest(conn, "ncaa_shots", year, rows, receipt)
                print(f"Imported ncaa_shots/{year}: {len(rows):,}", flush=True)
    build(conn)
    if args.sql:
        export_sql(conn, args.sql)
        export_ncaa_player_box_sql(conn, args.sql.with_name("ncaa-player-box-2026.sql"))
    conn.close()


if __name__ == "__main__":
    main()
