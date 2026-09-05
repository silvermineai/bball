"""Publish name-attributed defensive/specialist events without inventing player IDs."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path

from .football import DB_PATH, number, read_stats
from .football_sources import ROOT, utcnow

DB = ROOT / ".local/football-events.sqlite3"
OUT = ROOT / "frontend/public/data/football/events.json"
DEFINITIONS = (
    "https://github.com/sportsdataverse/cfbfastR/blob/master/R/load_espn_cfb.R"
)
FIELDS = {
    "defense": [
        (
            "sacks",
            "Sacks",
            "Sacks attributed by the source; fractional credits are retained.",
        ),
        (
            "sacks_yards",
            "Sack yards",
            "Source yardage on sacks, preserving its sign. Not converted to positive yards lost.",
        ),
        (
            "interceptions",
            "Interceptions",
            "Interceptions attributed to this name in this game.",
        ),
        (
            "interceptions_yards",
            "INT return yards",
            "Source interception-return yardage.",
        ),
        ("pass_breakups", "Pass breakups", "Pass breakups recorded by the source."),
        ("forced_fumbles", "Forced fumbles", "Forced fumbles recorded by the source."),
        (
            "fumble_recoveries",
            "Fumble recoveries",
            "Recovered fumbles recorded by the source.",
        ),
        (
            "fumble_recoveries_yards",
            "Recovery return yards",
            "Source yardage returned after fumble recoveries.",
        ),
    ],
    "specialists": [
        (
            "field_goals",
            "FG attempts",
            "Field-goal attempts, not makes. This field cannot establish accuracy.",
        ),
        (
            "field_goals_yards",
            "FG distance sum",
            "Sum of attempt distances parsed from play text. Source zero can mean no distance was parsed; do not treat this as a measured average distance.",
        ),
        ("punts", "Punt attempts", "Punts attempted, as recorded by the source."),
        (
            "punts_yards",
            "Gross punt yards",
            "Gross punt yardage parsed from source play text; not net punting.",
        ),
        (
            "kick_returns",
            "Kick returns",
            "Source kickoff-return count; not a complete return opportunity denominator.",
        ),
        (
            "kick_returns_yards",
            "Kick-return yards",
            "Source yardage on kickoff returns.",
        ),
        (
            "punt_returns",
            "Punt returns",
            "Source punt-return count; not a complete return opportunity denominator.",
        ),
        (
            "punt_returns_yards",
            "Punt-return yards",
            "Source punt-return yardage. Fair catches, downed punts and out-of-bounds punts may carry zero yards.",
        ),
    ],
}
LIMITATIONS = [
    "Names are source labels, not verified athlete identities. Records are never joined across games or seasons by name.",
    "These are selected event records, not complete defensive box scores, snap counts, rosters or player grades. Missing rows do not establish zero production.",
    "Missing or nonnumeric fields remain unavailable. Source zeroes are retained; parsed yardage may have additional source limitations.",
    "Team affiliations describe the selected game season. Game context is joined by source game and team IDs; unmatched context is marked explicitly.",
]


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def normalize(raw, key, dataset, season, games, teams):
    tid = raw.get("def_pos_team_id") if dataset == "defense" else raw.get("pos_team_id")
    team = teams.get(tid, {})
    g = games.get(raw.get("game_id"))
    matched = bool(g and g["season"] == season and tid in (g["home_id"], g["away_id"]))
    context = None
    if matched:
        context = {
            k: g[k]
            for k in [
                "id",
                "kickoff",
                "home_id",
                "away_id",
                "home_name",
                "away_name",
                "home_score",
                "away_score",
                "completed",
                "neutral",
                "time_tbd",
            ]
        }
        context["opponent"] = g["away_name"] if tid == g["home_id"] else g["home_name"]
    return {
        "record_key": str(key),
        "dataset": dataset,
        "season": season,
        "game_id": raw.get("game_id"),
        "team_id": tid,
        "team": raw.get("def_pos_team")
        or raw.get("pos_team")
        or team.get("display_name")
        or tid
        or "Unknown team",
        "division": team.get("division") or "unknown",
        "player_name": raw.get("player_name") or "Unnamed source record",
        "identity_status": "name_only",
        "context_status": "matched"
        if matched
        else ("team_mismatch" if g else "missing_game"),
        "game": context,
        "metrics": {key: number(raw.get(key)) for key, _, _ in FIELDS[dataset]},
        "raw": raw,
    }


def build(source, target, out=OUT):
    target.executescript(
        (ROOT / "worker/migrations/0014_football_events.sql").read_text()
    )
    games = {r["id"]: dict(r) for r in source.execute("SELECT * FROM football_games")}
    editions = []
    code_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    for ds, season, receipt_json in source.execute(
        "SELECT dataset,season,receipt_json FROM football_sources WHERE dataset IN ('defense','specialists') ORDER BY season,dataset"
    ):
        teams = {r["team_id"]: r for r in read_stats(source, "teams", season)}
        rows = [
            normalize(
                json.loads(r["stats_json"]), r["record_key"], ds, season, games, teams
            )
            for r in source.execute(
                "SELECT * FROM football_stats WHERE dataset=? AND season=? ORDER BY record_key",
                (ds, season),
            )
        ]
        receipts = [{"dataset": ds, **json.loads(receipt_json)}]
        for dependency in ["teams", "schedule"]:
            found = source.execute(
                "SELECT receipt_json FROM football_sources WHERE dataset=? AND season=?",
                (dependency, season),
            ).fetchone()
            if found:
                receipts.append({"dataset": dependency, **json.loads(found[0])})
        evidence = {
            "implementation_sha256": code_hash,
            "sources": receipts,
            "definitions_url": DEFINITIONS,
        }
        edition = (
            "football-events-"
            + hashlib.sha256(encoded([evidence, rows]).encode()).hexdigest()[:20]
        )
        coverage = {
            "records": len(rows),
            "games": len({r["game_id"] for r in rows if r["game_id"]}),
            "teams": len({r["team_id"] for r in rows if r["team_id"]}),
            "matched_context": sum(r["context_status"] == "matched" for r in rows),
            "name_only_records": len(rows),
            "fields": {
                key: {
                    "available": sum(r["metrics"][key] is not None for r in rows),
                    "positive": sum(
                        r["metrics"][key] is not None and r["metrics"][key] > 0
                        for r in rows
                    ),
                }
                for key, _, _ in FIELDS[ds]
            },
        }
        with target:
            target.execute(
                "INSERT OR IGNORE INTO football_event_editions VALUES (?,?,?,?,?,?)",
                (edition, ds, season, utcnow(), encoded(evidence), encoded(coverage)),
            )
            target.executemany(
                "INSERT OR IGNORE INTO football_events VALUES (?,?,?,?,?,?,?,?)",
                [
                    (
                        edition,
                        r["record_key"],
                        r["game_id"],
                        r["team_id"],
                        r["player_name"],
                        r["division"],
                        r["game"]["kickoff"] if r["game"] else None,
                        encoded(r),
                    )
                    for r in rows
                ],
            )
            target.execute(
                "INSERT OR REPLACE INTO football_event_active VALUES (?,?,?)",
                (ds, season, edition),
            )
        saved = target.execute(
            "SELECT generated_at FROM football_event_editions WHERE edition=?",
            (edition,),
        ).fetchone()[0]
        counts = Counter(r["team_id"] for r in rows if r["team_id"])
        labels = {r["team_id"]: r["team"] for r in rows}
        editions.append(
            {
                "dataset": ds,
                "season": season,
                "edition": edition,
                "generated_at": saved,
                "coverage": coverage,
                "evidence": evidence,
                "fields": [
                    {"key": k, "label": label, "definition": definition}
                    for k, label, definition in FIELDS[ds]
                ],
                "teams": sorted(
                    [
                        {"id": tid, "name": labels[tid], "records": n}
                        for tid, n in counts.items()
                    ],
                    key=lambda t: (t["name"], t["id"]),
                ),
            }
        )
    if not editions:
        raise ValueError("No defensive or specialist source editions are available")
    artifact = {
        "generated_at": max(e["generated_at"] for e in editions),
        "editions": editions,
        "limitations": LIMITATIONS,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(encoded(artifact))
    return artifact


def export_sql(conn, path):
    with path.open("w") as f:
        # Records/receipts are immutable. Activate only after all referenced rows exist.
        for table in [
            "football_event_editions",
            "football_events",
            "football_event_active",
        ]:
            verb = (
                "INSERT OR REPLACE"
                if table == "football_event_active"
                else "INSERT OR IGNORE"
            )
            for row in conn.execute("SELECT * FROM " + table):
                quoted = ",".join(
                    "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"
                    for v in row
                )
                f.write(f"{verb} INTO {table} VALUES ({quoted});\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", type=Path)
    args = parser.parse_args()
    source = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    target = sqlite3.connect(DB)
    result = build(source, target)
    if args.sql:
        export_sql(target, args.sql)
    print(
        json.dumps(
            [
                {"dataset": e["dataset"], "season": e["season"], **e["coverage"]}
                for e in result["editions"]
            ],
            indent=2,
        )
    )
    source.close()
    target.close()


if __name__ == "__main__":
    main()
