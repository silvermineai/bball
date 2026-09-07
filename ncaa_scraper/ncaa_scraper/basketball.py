"""Basketball research warehouse, efficiency ratings and 2026–27 forecasts."""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

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
            "ncaa_rapm": "bb_impact",
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
        elif dataset == "ncaa_rapm":
            conn.executemany(
                "INSERT OR REPLACE INTO bb_impact VALUES (?,?,?)",
                [(year, identity(r["player_id"]), json.dumps(r)) for r in rows],
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

    values = {key: weighted(key) for key in ("ppg", "rpg", "apg")}
    return {
        "games": games,
        "minutes": round(minutes, 1),
        "mpg": round(minutes / games, 1) if games else None,
        "ppg": round(values["ppg"], 1) if values["ppg"] is not None else None,
        "rpg": round(values["rpg"], 1) if values["rpg"] is not None else None,
        "apg": round(values["apg"], 1) if values["apg"] is not None else None,
        "teams": sorted({row["team"] for row in rows if row.get("team")}),
    }


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
    upcoming = []
    for g in games:
        if g["season"] == target and not g["completed"] and g["starts_at"] > now:
            p = forecast(model, g)
            cold_start = fallback_forecast(model, g) if p is None else None
            upcoming.append({**g, "prediction": p, "fallback_prediction": cold_start})
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
        "ratings": team_ratings(model, games, boxes, target - 1),
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
    with path.open("w") as f:
        for table in [
            "bb_games",
            "bb_team_box",
            "bb_player_box",
            "bb_player_season",
            "bb_rosters",
            "bb_impact",
            "bb_unresolved",
            "bb_participation",
        ]:
            for row in conn.execute(f"SELECT DISTINCT season FROM {table}"):
                f.write(f"DELETE FROM {table} WHERE season={int(row[0])};\n")
        for line in conn.iterdump():
            if line.startswith("INSERT INTO"):
                f.write(line.replace("INSERT INTO", "INSERT OR REPLACE INTO", 1) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--sql", type=Path)
    args = parser.parse_args()
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        (ROOT / "worker/migrations/0009_basketball_research.sql").read_text()
    )
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
            for dataset in datasets:
                rows, receipt = c.load(dataset, year, refresh=args.refresh)
                ingest(conn, dataset, year, rows, receipt)
                print(f"Imported {dataset}/{year}: {len(rows):,}", flush=True)
    build(conn)
    if args.sql:
        export_sql(conn, args.sql)
    conn.close()


if __name__ == "__main__":
    main()
