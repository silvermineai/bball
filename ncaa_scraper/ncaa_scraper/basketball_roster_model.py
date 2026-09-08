"""Research-only roster continuity challenger for the basketball forecast.

The primary forecast remains unchanged. This module fits a small, chronological
ridge model on prior team efficiency and source-listed roster continuity, then
publishes a clearly labeled scenario delta for the next-season slate. Roster
snapshots are not timestamped pre-season observations, so this is an exploratory
research artifact rather than a prospective ledger model.
"""

from __future__ import annotations

import json
import math
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

VERSION = "basketball-roster-challenger-v1"
FT_POSSESSION_WEIGHT = 0.475
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/public/data/basketball"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _profile(row: sqlite3.Row) -> dict:
    try:
        value = json.loads(row["profile_json"])
    except (TypeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _player_values(conn: sqlite3.Connection, season: int) -> dict[str, float]:
    """Return attributed publisher Box BPM by exact source player ID."""
    values: dict[str, float] = {}
    for row in conn.execute(
        "SELECT player_id,stats_json FROM bb_player_value WHERE season=?",
        (season,),
    ):
        try:
            stats = json.loads(row["stats_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        value = stats.get("box_bpm") if isinstance(stats, dict) else None
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            values[str(row["player_id"])] = float(value)
    return values


def team_net_ratings(conn: sqlite3.Connection) -> dict[int, dict[str, float]]:
    """Compute descriptive season net efficiency from paired team boxes."""
    games = {
        row["id"]: row
        for row in conn.execute(
            "SELECT id,season,home_id,away_id,home_score,away_score,completed,periods FROM bb_games"
        )
        if row["completed"] and row["home_score"] is not None and row["away_score"] is not None
    }
    boxes = {
        (row["game_id"], row["team_id"]): json.loads(row["stats_json"])
        for row in conn.execute("SELECT game_id,team_id,stats_json FROM bb_team_box")
    }
    totals: dict[int, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(lambda: [0.0, 0.0, 0.0])
    )
    for game_id, game in games.items():
        if game["periods"] is None or game["periods"] < 2:
            continue
        for own, opp in (("home", "away"), ("away", "home")):
            own_box = boxes.get((game_id, game[f"{own}_id"]))
            opp_box = boxes.get((game_id, game[f"{opp}_id"]))
            if not own_box or not opp_box:
                continue
            needed = ("field_goals_attempted", "free_throws_attempted", "offensive_rebounds", "turnovers")
            if any(own_box.get(key) is None or own_box[key] < 0 for key in needed):
                continue
            possessions = (
                own_box["field_goals_attempted"]
                + FT_POSSESSION_WEIGHT * own_box["free_throws_attempted"]
                - own_box["offensive_rebounds"]
                + own_box["turnovers"]
            )
            if possessions <= 0:
                continue
            team = str(game[f"{own}_id"])
            row = totals[int(game["season"])][team]
            row[0] += float(game[f"{own}_score"])
            row[1] += float(game[f"{opp}_score"])
            row[2] += float(possessions)
    return {
        season: {
            team: 100.0 * (values[0] - values[1]) / values[2]
            for team, values in rows.items()
            if values[2] > 0
        }
        for season, rows in totals.items()
    }


def roster_features(
    conn: sqlite3.Connection,
    season: int,
    prior_participation_season: int,
    nets: dict[int, dict[str, float]],
) -> list[dict]:
    """Build exact-athlete-ID continuity features for one source season."""
    prior: dict[str, list[dict]] = defaultdict(list)
    prior_values = _player_values(conn, prior_participation_season)
    for row in conn.execute(
        "SELECT athlete_id,team_id,games,minutes,name FROM bb_participation WHERE season=?",
        (prior_participation_season,),
    ):
        aid = str(row["athlete_id"] or "")
        if not aid or (row["name"] or "").strip().casefold() == "team":
            continue
        prior[aid].append({"team_id": str(row["team_id"]), "minutes": float(row["minutes"] or 0)})
    current: dict[str, list[dict]] = defaultdict(list)
    team_names: dict[str, str] = {}
    for row in conn.execute("SELECT season,team_id,athlete_id,profile_json FROM bb_rosters WHERE season=?", (season,)):
        profile = _profile(row)
        aid = str(row["athlete_id"] or profile.get("athlete_id") or "")
        name = str(profile.get("full_name") or "").strip()
        if not aid or not name or name.casefold() == "team":
            continue
        team = str(row["team_id"])
        current[team].append({"id": aid, "name": name})
        team_names[team] = str(profile.get("team_display_name") or team)
    rows = []
    for team, players in current.items():
        ids = {player["id"] for player in players}
        prior_minutes = sum(
            record["minutes"]
            for records in prior.values()
            for record in records
            if record["team_id"] == team
        )
        returning_minutes = sum(
            record["minutes"]
            for aid in ids
            for record in prior.get(aid, [])
            if record["team_id"] == team
        )
        represented_minutes = sum(
            record["minutes"] for aid in ids for record in prior.get(aid, [])
        )
        prior_value_minutes = sum(
            record["minutes"] * prior_values[aid]
            for aid, records in prior.items()
            if aid in prior_values
            for record in records
            if record["team_id"] == team
        )
        returning_value_minutes = sum(
            record["minutes"] * prior_values[aid]
            for aid in ids
            if aid in prior_values
            for record in prior.get(aid, [])
            if record["team_id"] == team
        )
        represented_value_minutes = sum(
            record["minutes"] * prior_values[aid]
            for aid in ids
            if aid in prior_values
            for record in prior.get(aid, [])
        )
        denominator = prior_minutes or 0.0
        returning_players = sum(
            any(record["team_id"] == team for record in prior.get(aid, [])) for aid in ids
        )
        represented_players = sum(bool(prior.get(aid)) for aid in ids)
        net = nets.get(season, {}).get(team)
        prior_net = nets.get(prior_participation_season, {}).get(team)
        rows.append(
            {
                "season": season,
                "team_id": team,
                "team": team_names.get(team, team),
                "listed_players": len(players),
                "returning_players": int(returning_players),
                "represented_players": int(represented_players),
                "new_players": len(players) - int(represented_players),
                "prior_minutes": round(prior_minutes, 2),
                "returning_minutes": round(returning_minutes, 2),
                "represented_prior_minutes": round(represented_minutes, 2),
                "unrepresented_prior_minutes": round(max(prior_minutes - represented_minutes, 0.0), 2),
                "returning_minutes_share": returning_minutes / prior_minutes if prior_minutes else None,
                "represented_minutes_share": represented_minutes / prior_minutes if prior_minutes else None,
                "incoming_minutes_share": (represented_minutes - returning_minutes) / prior_minutes if prior_minutes else None,
                "prior_bpm": prior_value_minutes / denominator if denominator else None,
                "returning_bpm": returning_value_minutes / denominator if denominator else None,
                "represented_bpm": represented_value_minutes / denominator if denominator else None,
                "incoming_bpm": (represented_value_minutes - returning_value_minutes) / denominator if denominator else None,
                "prior_net": prior_net,
                "target_net": net,
            }
        )
    return sorted(rows, key=lambda row: row["team"])


FEATURES = (
    "prior_net",
    "returning_minutes_share",
    "represented_minutes_share",
    "incoming_minutes_share",
    "listed_players",
    "prior_bpm",
    "represented_bpm",
)


def _matrix(rows: list[dict]) -> tuple[np.ndarray, np.ndarray, list[dict]]:
    usable = [
        row
        for row in rows
        if row.get("prior_net") is not None
        and row.get("target_net") is not None
        and all(row.get(key) is not None for key in FEATURES[1:])
    ]
    if not usable:
        return np.empty((0, len(FEATURES) + 1)), np.empty(0), []
    x = np.asarray([[1.0] + [float(row[key]) for key in FEATURES] for row in usable])
    y = np.asarray([float(row["target_net"]) for row in usable])
    return x, y, usable


def fit(rows: list[dict]) -> dict:
    x, y, usable = _matrix(rows)
    if len(usable) < 20:
        raise ValueError("At least 20 roster transition rows are required")
    penalty = np.eye(x.shape[1]) * 8.0
    penalty[0, 0] = 0
    coef = np.linalg.solve(x.T @ x + penalty, x.T @ y)
    return {"coefficients": coef.tolist(), "features": list(FEATURES), "rows": len(usable)}


def predict(model: dict, row: dict) -> float | None:
    if any(row.get(key) is None for key in FEATURES):
        return None
    values = [1.0] + [float(row[key]) for key in model["features"]]
    return float(np.asarray(values) @ np.asarray(model["coefficients"]))


def metrics(model: dict, rows: list[dict]) -> dict:
    scored = [(row, predict(model, row)) for row in rows]
    scored = [(row, value) for row, value in scored if value is not None and row.get("target_net") is not None]
    if not scored:
        return {"teams": 0, "mae": None, "rmse": None, "baseline_mae": None}
    errors = np.asarray([value - float(row["target_net"]) for row, value in scored])
    baseline = np.asarray([float(row["prior_net"]) - float(row["target_net"]) for row, _ in scored])
    return {
        "teams": len(scored),
        "mae": float(np.abs(errors).mean()),
        "rmse": float(np.sqrt((errors**2).mean())),
        "baseline_mae": float(np.abs(baseline).mean()),
        "improvement_vs_prior_net": float(np.abs(baseline).mean() - np.abs(errors).mean()),
    }


def build(conn: sqlite3.Connection, primary_model: dict, upcoming: list[dict]) -> dict:
    nets = team_net_ratings(conn)
    transitions = {
        season: roster_features(conn, season, season - 1, nets)
        for season in (2025, 2026, 2027)
    }
    historical = transitions[2025] + transitions[2026]
    chronological = fit(transitions[2025])
    evaluation = metrics(chronological, transitions[2026])
    production = fit(historical)
    current_rows = []
    for row in transitions[2027]:
        current = {**row, "predicted_net": predict(production, row)}
        current_rows.append(current)
    current_by_team = {row["team_id"]: row for row in current_rows}
    scenarios = []
    for game in upcoming:
        prediction = game.get("prediction")
        home = current_by_team.get(str(game["home_id"]))
        away = current_by_team.get(str(game["away_id"]))
        if not prediction or not home or not away:
            continue
        if home.get("predicted_net") is None or away.get("predicted_net") is None:
            continue
        prior_home = home.get("prior_net")
        prior_away = away.get("prior_net")
        if prior_home is None or prior_away is None:
            continue
        net_delta = (home["predicted_net"] - prior_home) - (away["predicted_net"] - prior_away)
        margin_delta = net_delta * float(prediction["pace"]) / 100.0
        scenario_margin = float(prediction["home_margin"]) + margin_delta
        scenarios.append(
            {
                "game_id": game["id"],
                "home_id": game["home_id"],
                "away_id": game["away_id"],
                "base_margin": prediction["home_margin"],
                "roster_margin": round(scenario_margin, 3),
                "margin_delta": round(margin_delta, 3),
                "home_predicted_net": round(home["predicted_net"], 3),
                "away_predicted_net": round(away["predicted_net"], 3),
            }
        )
    return {
        "version": VERSION,
        "generated_at": _now(),
        "target_season": 2027,
        "training_seasons": [2025, 2026],
        "feature_definition": "Prior descriptive team net efficiency plus exact-athlete-ID source-listed returning, represented and incoming prior-minute shares, listed-player count and minutes-weighted attributed publisher Box BPM retained by source player ID.",
        "model": production,
        "evaluation": {"held_out_transition": 2026, **evaluation},
        "coverage": {
            "transition_rows": {str(season): len(rows) for season, rows in transitions.items()},
            "current_predicted_teams": sum(row["predicted_net"] is not None for row in current_rows),
            "scenario_games": len(scenarios),
        },
        "limitations": [
            "Roster releases are source snapshots without a verified pre-season publication clock.",
            "The challenger is research-only and does not replace the primary forecast or enter the prospective ledger.",
            "Only two historical roster transitions are available for fitting; the held-out evaluation is one season and is not a guarantee of future performance.",
            "Roster listings do not establish eligibility, availability, transfer reason, injury status or depth-chart role.",
            "Publisher Box BPM is unavailable for some source IDs; rows without prior BPM coverage are withheld from the challenger rather than imputed.",
            "The scenario changes the primary margin by the learned team-strength delta but does not recalibrate win probability or uncertainty.",
        ],
        "teams": current_rows,
        "scenarios": scenarios,
    }


def write(conn: sqlite3.Connection, primary_model: dict, upcoming: list[dict]) -> dict:
    result = build(conn, primary_model, upcoming)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "roster-model.json").write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
    return result


if __name__ == "__main__":
    db = ROOT / ".local/basketball.sqlite3"
    with sqlite3.connect(db) as conn:
        conn.row_factory = sqlite3.Row
        overview = json.loads((OUT / "overview.json").read_text())
        result = write(conn, overview["model"], overview["upcoming"])
        print(json.dumps({"evaluation": result["evaluation"], "coverage": result["coverage"]}, indent=2))
