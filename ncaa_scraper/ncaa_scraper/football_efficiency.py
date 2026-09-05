"""Build auditable team efficiency comparisons from retained advanced game rows."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from pathlib import Path

from .football import DB_PATH, number, read_stats
from .football_sources import ATTRIBUTION, ROOT

OUT = ROOT / "frontend/public/data/football"
DEFINITIONS = (
    "https://github.com/sportsdataverse/cfbfastR/blob/master/R/load_espn_cfb.R"
)
# Ratios of paired finite totals, never averages of rounded game rates.
METRICS = [
    (
        "epa",
        "EPA / play",
        "EPA_overall_off",
        "scrimmage_plays",
        "number",
        "Offensive expected points added divided by recorded scrimmage plays. Source EPA totals are rounded; this is unadjusted production.",
    ),
    (
        "pass_epa",
        "Pass EPA / play",
        "EPA_passing_overall",
        "passes",
        "number",
        "Passing EPA divided by source pass plays; these are not necessarily official pass attempts.",
    ),
    (
        "rush_epa",
        "Rush EPA / play",
        "EPA_rushing_overall",
        "rushes",
        "number",
        "Rushing EPA divided by source rushing plays.",
    ),
    (
        "ypp",
        "Yards / play",
        "off_yards",
        "scrimmage_plays",
        "number",
        "Source offensive yards divided by scrimmage plays. Do not substitute passing plus rushing yards for the published offensive total.",
    ),
    (
        "explosive",
        "Explosive play share",
        "EPA_explosive",
        "scrimmage_plays",
        "percent",
        "Source-classified explosive plays divided by scrimmage plays. EPA_explosive is a count, not EPA. This is our stated denominator, not a claim to reproduce every source rate or a fixed yardage threshold.",
    ),
    (
        "pass_share",
        "Pass play share",
        "passes",
        "scrimmage_plays",
        "percent",
        "Pass plays divided by scrimmage plays. Describes play selection, not pass success.",
    ),
    (
        "first_down",
        "First-down play share",
        "first_downs_created",
        "scrimmage_plays",
        "percent",
        "Source first downs created divided by scrimmage plays. This is not standard down-and-distance success rate.",
    ),
    (
        "power",
        "Power rush conversion",
        "rushing_power_success",
        "rushing_power",
        "percent",
        "Successful source-classified short-yardage power rushes divided by power attempts. No opportunities means unavailable, not zero percent.",
    ),
    (
        "stuff",
        "Stuffed rush share",
        "rushing_stuff",
        "rushes",
        "percent",
        "Source stuffed carries divided by rushing plays. Lower is favorable for an offense; higher is favorable for the defending team.",
    ),
    (
        "opportunity",
        "Rush opportunity share",
        "rushing_opportunity",
        "rushes",
        "percent",
        "Source-classified rushing opportunities divided by rushes; no additional yardage threshold is inferred.",
    ),
    (
        "line_yards",
        "Line yards / rush",
        "line_yards",
        "rushes",
        "number",
        "Source line-credited rushing yards divided by rushing plays. A statistical allocation, not a player blocking grade.",
    ),
    (
        "special_epa",
        "Special-teams EPA / play",
        "EPA_special_teams",
        "special_teams_plays",
        "number",
        "Source special-teams EPA divided by special-teams plays. Shown separately from offensive EPA; phases are never added together.",
    ),
]


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def aggregate(rows):
    result = {}
    for key, _, numerator, denominator, _, _ in METRICS:
        pairs = [(number(r.get(numerator)), number(r.get(denominator))) for r in rows]
        pairs = [(n, d) for n, d in pairs if n is not None and d is not None and d > 0]
        n, d = math.fsum(p[0] for p in pairs), math.fsum(p[1] for p in pairs)
        result[key] = {
            "value": n / d if d else None,
            "numerator": n,
            "denominator": d,
            "games": len(pairs),
        }
    return result


def final(game):
    return bool(
        game["completed"]
        and game["home_score"] is not None
        and game["away_score"] is not None
    )


def season_release(rows, games, directory, season):
    indexed = {}
    for raw in rows:
        gid, tid = raw.get("game_id"), raw.get("pos_team_id")
        game = games.get(gid)
        if (
            not game
            or game["season"] != season
            or int(raw["season"]) != season
            or tid not in (game["home_id"], game["away_id"])
        ):
            raise ValueError("Advanced row has unresolved game/team/season identity")
        if (gid, tid) in indexed:
            raise ValueError("Duplicate team-game row; aggregation would double count")
        indexed[gid, tid] = raw
    profiles = []
    for tid in sorted({tid for _, tid in indexed}):
        team = directory.get(tid, {})
        # Historical team directories can label all-star squads as FBS. Use
        # nonempty labels on this season's actual schedule, as opponent filters do.
        divisions = {
            g["home_division" if tid == g["home_id"] else "away_division"]
            for g in games.values()
            if g["season"] == season and tid in (g["home_id"], g["away_id"])
        } - {None, ""}
        logs = []
        schedule = [
            g
            for g in games.values()
            if g["season"] == season
            and tid in (g["home_id"], g["away_id"])
            and final(g)
        ]
        for (gid, team_id), raw in indexed.items():
            if tid != team_id:
                continue
            g = games[gid]
            side = "home" if tid == g["home_id"] else "away"
            other = "away" if side == "home" else "home"
            opponent = g[other + "_id"]
            opponent_raw = indexed.get((gid, opponent))
            logs.append(
                {
                    "game_id": gid,
                    "kickoff": g["kickoff"],
                    "time_tbd": g["time_tbd"],
                    "season_type": json.loads(g["source_json"]).get(
                        "season_type", "unknown"
                    ),
                    "opponent_id": opponent,
                    "opponent": g[other + "_name"],
                    "opponent_division": g[other + "_division"] or "unknown",
                    "venue": "neutral" if g["neutral"] else side,
                    "team_score": g[side + "_score"],
                    "opponent_score": g[other + "_score"],
                    "included": final(g),
                    "raw": raw,
                    "opponent_raw": opponent_raw,
                    "offense": aggregate([raw]),
                    "defense": aggregate([opponent_raw] if opponent_raw else []),
                }
            )
        logs.sort(key=lambda r: (r["kickoff"], r["game_id"]))
        samples = {}
        for scope in ["all", "fbs"]:
            selected = [
                r
                for r in logs
                if r["included"] and (scope == "all" or r["opponent_division"] == "fbs")
            ]
            eligible = [
                g
                for g in schedule
                if scope == "all"
                or g["away_division" if tid == g["home_id"] else "home_division"]
                == "fbs"
            ]
            samples[scope] = {
                "games": len(selected),
                "paired_games": sum(r["opponent_raw"] is not None for r in selected),
                "scheduled_finals": len(eligible),
                "missing_games": [
                    {
                        "id": g["id"],
                        "kickoff": g["kickoff"],
                        "opponent": g[
                            "away_name" if tid == g["home_id"] else "home_name"
                        ],
                    }
                    for g in eligible
                    if (g["id"], tid) not in indexed
                ],
                "offense": aggregate([r["raw"] for r in selected]),
                "defense": aggregate(
                    [
                        r["opponent_raw"]
                        for r in selected
                        if r["opponent_raw"] is not None
                    ]
                ),
            }
        profiles.append(
            {
                "season": season,
                "id": tid,
                "name": team.get("short_display_name") or logs[0]["raw"]["pos_team"],
                "division": next(iter(divisions)) if len(divisions) == 1 else "unknown",
                "conference": team.get("conference_short_name") or "Unknown conference",
                "samples": samples,
                "games": logs,
            }
        )
    return profiles


def build(source):
    games = {r["id"]: dict(r) for r in source.execute("SELECT * FROM football_games")}
    receipts = [
        dict(r)
        for r in source.execute(
            "SELECT * FROM football_sources WHERE dataset IN ('team_advanced','schedule','teams') AND season IN (SELECT season FROM football_sources WHERE dataset='team_advanced') ORDER BY season,dataset"
        )
    ]
    sources = [json.loads(r["receipt_json"]) for r in receipts]
    index = {
        "schema_version": 1,
        "implementation_sha256": hashlib.sha256(
            Path(__file__).read_bytes()
        ).hexdigest(),
        "attribution": ATTRIBUTION,
        "definitions_url": DEFINITIONS,
        "sources": sources,
        "metrics": [
            dict(
                zip(
                    [
                        "key",
                        "label",
                        "numerator",
                        "denominator",
                        "format",
                        "definition",
                    ],
                    m,
                )
            )
            for m in METRICS
        ],
        "seasons": [],
    }
    files = {}
    for season in sorted(
        {r["season"] for r in receipts if r["dataset"] == "team_advanced"}, reverse=True
    ):
        rows = read_stats(source, "team_advanced", season)
        directory = {r["team_id"]: r for r in read_stats(source, "teams", season)}
        profiles = season_release(rows, games, directory, season)
        teams = []
        for profile in profiles:
            profile["sources"] = [r for r in sources if r["season"] == season]
            key = digest(profile)
            files[f"efficiency/profiles/{key}.json"] = profile
            teams.append(
                {k: v for k, v in profile.items() if k not in ["games", "sources"]}
                | {"profile_hash": key}
            )
        ids = {r["game_id"] for r in rows}
        index["seasons"].append(
            {
                "season": season,
                "records": len(rows),
                "games": len(ids),
                "teams": teams,
                "paired_games": sum(
                    sum(r["game_id"] == gid for r in rows) == 2 for gid in ids
                ),
                "source_fetched_at": next(
                    r["fetched_at"]
                    for r in sources
                    if r["dataset"] == "team_advanced" and r["season"] == season
                ),
            }
        )
    index["edition"] = digest(index)
    files["efficiency.json"] = index
    return files


def export(files, out=OUT):
    for name, value in files.items():
        path = out / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(encoded(value) + "\n")
    return {
        "edition": files["efficiency.json"]["edition"],
        "files": {
            name: hashlib.sha256((encoded(value) + "\n").encode()).hexdigest()
            for name, value in files.items()
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        files = build(conn)
    manifest = export(files, args.out)
    path = ROOT / ".local/football-efficiency-manifest.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(encoded(manifest))
    print(
        json.dumps(
            {
                "edition": manifest["edition"],
                "profiles": len(files) - 1,
                "seasons": [
                    {k: s[k] for k in ["season", "records", "games", "paired_games"]}
                    for s in files["efficiency.json"]["seasons"]
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
