"""Descriptive basketball scouting profiles from attributed D1 source records.

Rates pool their own matched numerators/denominators. They are not new forecasts.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
from collections import defaultdict

from .basketball import DB, OUT, load_games
from .basketball_model import FT_POSSESSION_WEIGHT, game_features
from .football_sources import utcnow

METRICS = {
    "off_eff": (
        "Offensive efficiency",
        "points",
        True,
        "Points per 100 estimated possessions.",
    ),
    "def_eff": (
        "Defensive efficiency",
        "points",
        False,
        "Opponent points per 100 estimated possessions.",
    ),
    "off_efg": ("Effective FG%", "percent", True, "(FGM + 0.5 × 3PM) / FGA."),
    "def_efg": (
        "Opponent effective FG%",
        "percent",
        False,
        "Opponent (FGM + 0.5 × 3PM) / FGA.",
    ),
    "off_tov": (
        "Turnover rate",
        "percent",
        False,
        "Turnovers / estimated possessions.",
    ),
    "def_tov": (
        "Turnovers forced",
        "percent",
        True,
        "Opponent turnovers / estimated possessions.",
    ),
    "off_orb": (
        "Offensive rebound rate",
        "percent",
        True,
        "ORB / (ORB + opponent DRB).",
    ),
    "def_orb": (
        "Opponent offensive rebound rate",
        "percent",
        False,
        "Opponent ORB / (opponent ORB + DRB).",
    ),
    "off_ftr": (
        "Free-throw attempt rate",
        "percent",
        True,
        "FTA / FGA; displayed per 100 field-goal attempts.",
    ),
    "def_ftr": (
        "Opponent free-throw attempt rate",
        "percent",
        False,
        "Opponent FTA / FGA.",
    ),
    "off_two": ("Two-point FG%", "percent", True, "(FGM − 3PM) / (FGA − 3PA)."),
    "def_two": (
        "Opponent two-point FG%",
        "percent",
        False,
        "Opponent (FGM − 3PM) / (FGA − 3PA).",
    ),
    "off_three": ("Three-point FG%", "percent", True, "3PM / 3PA."),
    "def_three": ("Opponent three-point FG%", "percent", False, "Opponent 3PM / 3PA."),
    "off_three_rate": (
        "Three-point attempt share",
        "percent",
        None,
        "3PA / FGA; a style measure, not a quality grade.",
    ),
    "def_three_rate": (
        "Opponent three-point attempt share",
        "percent",
        None,
        "Opponent 3PA / FGA; a style measure.",
    ),
    "off_ft": ("Free-throw accuracy", "percent", True, "FTM / FTA."),
    "def_ft": (
        "Opponent free-throw accuracy",
        "percent",
        None,
        "Opponent FTM / FTA; not attributed to defensive skill.",
    ),
    "off_assist": (
        "Assisted field-goal share",
        "percent",
        None,
        "Assists / FGM; describes recorded ball movement.",
    ),
    "def_assist": (
        "Opponent assisted FG share",
        "percent",
        None,
        "Opponent assists / FGM.",
    ),
}


def valid(*values):
    return all(
        isinstance(v, (int, float))
        and not isinstance(v, bool)
        and math.isfinite(v)
        and v >= 0
        for v in values
    )


def components(box, opp, points, poss):
    """Return only complete, valid numerator/denominator pairs for one game."""
    result = {}

    def put(key, n, d, scale=1):
        if valid(n, d) and d > 0:
            result[key] = (n * scale, d)

    fg, fa = box.get("field_goals_made"), box.get("field_goals_attempted")
    th, ta = (
        box.get("three_point_field_goals_made"),
        box.get("three_point_field_goals_attempted"),
    )
    ft, fta = box.get("free_throws_made"), box.get("free_throws_attempted")
    if valid(fg, fa, th, ta) and th <= fg <= fa and th <= ta <= fa:
        put("efg", fg + 0.5 * th, fa)
        if 0 <= fg - th <= fa - ta:
            put("two", fg - th, fa - ta)
    if valid(th, ta) and th <= ta:
        put("three", th, ta)
    if valid(ta, fa) and ta <= fa:
        put("three_rate", ta, fa)
    if valid(ft, fta) and ft <= fta:
        put("ft", ft, fta)
    if valid(fta, fa):
        put("ftr", fta, fa)
    orb, drb = box.get("offensive_rebounds"), opp.get("defensive_rebounds")
    if valid(orb, drb):
        put("orb", orb, orb + drb)
    ast = box.get("assists")
    if valid(ast, fg) and ast <= fg:
        put("assist", ast, fg)
    if valid(poss) and poss > 0:
        if valid(points):
            put("eff", points, poss, 100)
        if valid(box.get("turnovers")):
            put("tov", box["turnovers"], poss)
    return result


def describe_game(game, tid, boxes, ratings):
    side = "home" if game["home_id"] == tid else "away"
    other = "away" if side == "home" else "home"
    own, opp = (
        boxes.get((game["id"], tid), {}),
        boxes.get((game["id"], game[other + "_id"]), {}),
    )
    f = game_features(game, boxes)
    poss = f["possessions"] if f else None
    score, allowed = game[side + "_score"], game[other + "_score"]
    complete = bool(game["completed"] and valid(score, allowed))
    rates = {}
    if complete:
        for prefix, a, b, pts in [("off", own, opp, score), ("def", opp, own, allowed)]:
            rates.update(
                {prefix + "_" + k: v for k, v in components(a, b, pts, poss).items()}
            )
    opponent = ratings.get(game[other + "_id"])
    return {
        "id": game["id"],
        "starts_at": game["starts_at"],
        "season": game["season"],
        "opponent_id": game[other + "_id"],
        "opponent": game[other + "_name"],
        "opponent_rank": opponent["rank"] if opponent else None,
        "opponent_net": opponent["adj_net"] if opponent else None,
        "location": "neutral"
        if game["neutral"]
        else "home"
        if side == "home"
        else "road",
        "score": score if complete else None,
        "allowed": allowed if complete else None,
        "result": "W"
        if complete and score > allowed
        else "L"
        if complete and score < allowed
        else "T"
        if complete
        else None,
        "possessions": poss,
        "pace": f["pace"] if f else None,
        "components": rates,
        "rates": {k: n / d for k, (n, d) in rates.items()},
    }


def aggregate(games):
    pooled = defaultdict(lambda: [0.0, 0.0, 0])
    for game in games:
        for key, (n, d) in game["components"].items():
            pooled[key][0] += n
            pooled[key][1] += d
            pooled[key][2] += 1
    metrics = {
        key: {
            "value": pooled[key][0] / pooled[key][1] if pooled[key][1] > 0 else None,
            "games": pooled[key][2],
        }
        for key in METRICS
    }
    scores = [g for g in games if g["result"] is not None]
    paired = [g for g in games if g["possessions"] is not None]
    minutes = sum(g["possessions"] * 40 / g["pace"] for g in paired)
    close = [g for g in scores if abs(g["score"] - g["allowed"]) <= 5]
    rated = [g for g in games if g["opponent_net"] is not None]
    return {
        "games": len(games),
        "scored_games": len(scores),
        "paired_games": len(paired),
        "wins": sum(g["result"] == "W" for g in scores),
        "losses": sum(g["result"] == "L" for g in scores),
        "ties": sum(g["result"] == "T" for g in scores),
        "pace": 40 * sum(g["possessions"] for g in paired) / minutes
        if minutes
        else None,
        "close_games": len(close),
        "close_wins": sum(g["result"] == "W" for g in close),
        "sos": sum(g["opponent_net"] for g in rated) / len(rated) if rated else None,
        "sos_games": len(rated),
        "metrics": metrics,
    }


def rank_metrics(profiles):
    for metric, (_, _, higher, _) in METRICS.items():
        if higher is None:
            continue
        pool = [
            p["splits"]["season"]["metrics"][metric]
            for p in profiles
            if p["splits"]["season"]["metrics"][metric]["value"] is not None
            and p["splits"]["season"]["metrics"][metric]["games"] >= 10
        ]
        pool.sort(key=lambda m: m["value"], reverse=higher)
        i = 0
        while i < len(pool):
            j = i + 1
            while j < len(pool) and math.isclose(
                pool[j]["value"], pool[i]["value"], abs_tol=1e-12, rel_tol=0
            ):
                j += 1
            percentile = (
                100 * (len(pool) - 1 - (i + j - 1) / 2) / (len(pool) - 1)
                if len(pool) > 1
                else 50.0
            )
            for item in pool[i:j]:
                item.update(rank=i + 1, population=len(pool), percentile=percentile)
            i = j


def player_workloads(conn, games, boxes, season):
    """Minute-prorated team opportunities; not reconstructed on-court possessions."""
    lookup = {g["id"]: g for g in games if g["season"] == season and g["completed"]}
    totals = defaultdict(lambda: defaultdict(float))
    for row in conn.execute(
        "SELECT team_id,athlete_id,game_id,stats_json FROM bb_player_box WHERE season=?",
        (season,),
    ):
        g = lookup.get(row["game_id"])
        if g is None or row["team_id"] not in (g["home_id"], g["away_id"]):
            continue
        b = json.loads(row["stats_json"])
        mins = b.get("minutes")
        if b.get("did_not_play") == "true" or not valid(mins) or mins <= 0:
            continue
        if g["periods"] is None or g["periods"] < 2:
            continue
        duration = 40 + max(0, g["periods"] - 2) * 5
        if mins > duration + 1:
            continue
        t = totals[(row["team_id"], row["athlete_id"])]
        t["appearance_games"] += 1
        t["minutes"] += mins
        t["available_minutes"] += duration
        own = boxes.get((g["id"], row["team_id"]), {})
        counts = [
            b.get(k)
            for k in ("field_goals_attempted", "free_throws_attempted", "turnovers")
        ]
        team = [
            own.get(k)
            for k in ("field_goals_attempted", "free_throws_attempted", "turnovers")
        ]
        if valid(*counts, *team) and all(a <= z for a, z in zip(counts, team)):
            plays = team[0] + FT_POSSESSION_WEIGHT * team[1] + team[2]
            if plays > 0:
                t["used"] += counts[0] + FT_POSSESSION_WEIGHT * counts[1] + counts[2]
                t["exposure"] += mins / duration * plays
                t["usage_games"] += 1
        if valid(b.get("assists"), b.get("turnovers")):
            t["assists"] += b["assists"]
            t["turnovers"] += b["turnovers"]
            t["ast_to_games"] += 1
        if valid(b.get("three_point_field_goals_attempted")):
            t["three_attempts"] += b["three_point_field_goals_attempted"]
            t["three_games"] += 1
    return {
        key: {
            "usage_est": t["used"] / t["exposure"] if t["exposure"] else None,
            "usage_games": int(t["usage_games"]),
            "minutes_share": t["minutes"] / t["available_minutes"]
            if t["available_minutes"]
            else None,
            "workload_games": int(t["appearance_games"]),
            "assist_turnover_ratio": t["assists"] / t["turnovers"]
            if t["turnovers"]
            else None,
            "assist_turnover_games": int(t["ast_to_games"]),
            "three_attempt_games": int(t["three_games"]),
            "three_attempts": int(t["three_attempts"])
            if t["three_games"] == t["appearance_games"]
            else None,
        }
        for key, t in totals.items()
    }


def build(conn, overview, players):
    season = overview["season"] - 1
    if players["season"] != season:
        raise ValueError("Player and scouting seasons must match")
    ratings = {r["id"]: r for r in overview["ratings"]}
    games, boxes, _ = load_games(conn)
    appearances = player_workloads(conn, games, boxes, season)
    personnel = defaultdict(list)
    for player in players["players"]:
        personnel[player["team_id"]].append(
            {**player, **appearances.get((player["team_id"], player["id"]), {})}
        )
    by_team = defaultdict(list)
    for game in games:
        if game["season"] != season or not game["completed"]:
            continue
        for tid in (game["home_id"], game["away_id"]):
            if tid in ratings:
                by_team[tid].append(describe_game(game, tid, boxes, ratings))
    profiles = []
    for tid, rating in ratings.items():
        logs = sorted(by_team[tid], key=lambda g: (g["starts_at"], g["id"]))
        views = {
            "season": logs,
            "last10": logs[-10:],
            "last5": logs[-5:],
            "home": [g for g in logs if g["location"] == "home"],
            "road": [g for g in logs if g["location"] == "road"],
            "neutral": [g for g in logs if g["location"] == "neutral"],
            "top50": [
                g
                for g in logs
                if g["opponent_rank"] is not None and g["opponent_rank"] <= 50
            ],
        }
        profiles.append(
            {
                "id": tid,
                "name": rating["name"],
                "season": season,
                "rating": rating,
                "splits": {k: aggregate(v) for k, v in views.items()},
                "games": logs,
                "players": sorted(personnel[tid], key=lambda p: -p["minutes"]),
                "upcoming": [
                    g
                    for g in overview["upcoming"]
                    if tid in (g["home_id"], g["away_id"])
                ],
            }
        )
    rank_metrics(profiles)
    for profile in profiles:
        for game in profile["games"]:
            game.pop("components")
    return {
        "season": season,
        "forecast_season": overview["season"],
        "generated_at": utcnow(),
        "source_edition": overview["generated_at"],
        "model_id": overview["model"]["id"],
        "metrics": {
            k: {
                "label": v[0],
                "format": v[1],
                "higher_better": v[2],
                "description": v[3],
            }
            for k, v in METRICS.items()
        },
        "teams": profiles,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    overview = json.loads((OUT / "overview.json").read_text())
    players = json.loads((OUT / "players.json").read_text())
    for receipt in overview["sources"]:
        if receipt["season"] == overview["season"] - 1 and receipt["dataset"] in (
            "schedule",
            "team_box",
            "player_box",
        ):
            current = conn.execute(
                "SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?",
                (receipt["dataset"], receipt["season"]),
            ).fetchone()
            if not current or json.loads(current[0])["sha256"] != receipt["sha256"]:
                raise ValueError(
                    "Source database and published model edition differ; rebuild basketball first"
                )
    data = build(conn, overview, players)
    conn.close()
    directory = OUT / "scouting"
    directory.mkdir(parents=True, exist_ok=True)
    index = {k: v for k, v in data.items() if k != "teams"}
    index["teams"] = [
        {
            **{k: p[k] for k in ("id", "name", "season", "rating")},
            "record": {
                k: p["splits"]["season"][k]
                for k in ("wins", "losses", "ties", "games", "paired_games")
            },
        }
        for p in data["teams"]
    ]
    (directory / "index.json").write_text(
        json.dumps(index, separators=(",", ":"), allow_nan=False)
    )
    for profile in data["teams"]:
        payload = {**{k: v for k, v in data.items() if k != "teams"}, **profile}
        (directory / f"{profile['id']}.json").write_text(
            json.dumps(payload, separators=(",", ":"), allow_nan=False)
        )
    print(
        json.dumps(
            {
                "profiles": len(data["teams"]),
                "team_game_rows": sum(len(p["games"]) for p in data["teams"]),
                "player_team_entries": sum(len(p["players"]) for p in data["teams"]),
                "paired_team_games": sum(
                    p["splits"]["season"]["paired_games"] for p in data["teams"]
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
