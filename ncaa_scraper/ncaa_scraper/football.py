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

from .football_model import forecast, train_and_evaluate
from .football_sources import (
    ATTRIBUTION,
    DATASETS,
    ROOT,
    ReleaseClient,
    utcnow,
)

DB_PATH = ROOT / ".local" / "football.sqlite3"
OUT = ROOT / "frontend" / "public" / "data" / "football"


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
        "home_division": row.get("home_division"),
        "away_division": row.get("away_division"),
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
                        row.get("game_id"),
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
    for r in read_stats(conn, "box", year):
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
        p["categories"] = sorted(p["categories"])
        p["box_games"] = len(p.pop("games"))
    return {
        "season": year,
        "rankings": boards,
        "players": sorted(players.values(), key=lambda p: p["name"]),
    }


def build(conn, season=2026):
    now = utcnow()
    games = [
        dict(r)
        for r in conn.execute("SELECT * FROM football_games ORDER BY kickoff,id")
    ]
    model = train_and_evaluate(games, now, season)
    upcoming = []
    for g in games:
        if (
            g["season"] != season
            or g["completed"]
            or g["kickoff"] <= now
            or not (g["home_division"] == "fbs" or g["away_division"] == "fbs")
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
            "SELECT count(*) FROM football_stats WHERE dataset='box'"
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
    artifacts = {"overview": overview}
    for year in [season - 1, season]:
        artifacts[f"players-{year}"] = player_board(conn, year)
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
        for year in range(args.season - 4, args.season + 1):
            for dataset in ["schedule"] if year < args.season - 1 else DATASETS:
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
