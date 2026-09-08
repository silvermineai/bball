"""Reconciled shot evidence from bulk play-by-play, with explicit coverage gaps."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict

import pyarrow.parquet as pq

from .basketball import DB, OUT, ROOT, load_games
from .basketball_sources import client
from .bulk_parquet import parquet_file
from .football_sources import utcnow

SHOT_DB = ROOT / ".local/basketball-shots.sqlite3"
BOX_KEYS = [
    "field_goals_attempted",
    "field_goals_made",
    "three_point_field_goals_attempted",
    "three_point_field_goals_made",
]
TYPES = {
    "JumpShot": "jumper",
    "LayUpShot": "layup",
    "DunkShot": "dunk",
    "TipShot": "tip",
    "Shot": "other",
}
COLUMNS = [
    "id",
    "game_id",
    "game_play_number",
    "season",
    "type_text",
    "text",
    "shooting_play",
    "scoring_play",
    "score_value",
    "points_attempted",
    "team_id",
    "athlete_id_1",
    "athlete_name_1",
    "period_number",
    "clock_display_value",
    "coordinate_x_raw",
    "coordinate_y_raw",
]


def dumps(value):
    return json.dumps(value, separators=(",", ":"), allow_nan=False)


def identity(v):
    return str(v) if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None


def location(x, y, points, kind, text):
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (x, y)):
        return None, None, "missing"
    if not (0 <= x <= 50 and -5.25 <= y <= 88.75):
        return None, None, "out_of_bounds"
    distance = math.hypot(x - 25, y)
    # The upstream feed commonly uses basket-center defaults. Retain the event,
    # but do not let placeholders or contradictory coordinates shape the map.
    if (x, y) in [(25, 0), (0, 0)]:
        return None, None, "placeholder"
    stated = re.search(r"(\d+)-foot", text)
    if (
        (stated and abs(float(stated[1]) - distance) > 4)
        or (points == 3 and distance < 20)
        or (kind in ["layup", "dunk", "tip"] and distance > 10)
    ):
        return None, None, "inconsistent"
    return x, y, "located"


def normalize(row, game):
    if row.get("shooting_play") is not True or row.get("type_text") not in TYPES:
        return None, "not_field_goal"
    points = row.get("points_attempted")
    # The 2024 publisher release predates points_attempted and leaves that
    # field null when read through the shared column projection. score_value
    # describes the attempt value on makes and misses, so it is the safe
    # release-compatible fallback. A zero points_attempted is also a known
    # publisher encoding for the same missing value.
    inferred = points in (None, 0)
    if inferred:
        points = row.get("score_value")
    if points not in (2, 3) or row.get("scoring_play") not in (True, False):
        return None, "ambiguous_outcome"
    if row.get("score_value") != points:
        return None, "conflicting_value"
    team, player, event = (
        identity(row.get("team_id")),
        identity(row.get("athlete_id_1")),
        identity(row.get("id")),
    )
    if not event or team not in (game["home_id"], game["away_id"]):
        return None, "unresolved_team_or_event"
    kind = "three" if points == 3 else TYPES[row["type_text"]]
    text = (row.get("text") or "")[:400]
    x, y, status = location(
        row.get("coordinate_x_raw"), row.get("coordinate_y_raw"), points, kind, text
    )
    return {
        "id": event,
        "team": team,
        "player": player,
        "player_name": row.get("athlete_name_1") or player,
        "order": row.get("game_play_number") or 0,
        "period": row.get("period_number"),
        "clock": row.get("clock_display_value"),
        "points": points,
        "made": row["scoring_play"],
        "type": kind,
        "x": x,
        "y": y,
        "location_status": status,
        "text": text,
        "inferred_value": inferred,
    }, None


def counts(shots):
    return [
        len(shots),
        sum(s["made"] for s in shots),
        sum(s["points"] == 3 for s in shots),
        sum(s["made"] and s["points"] == 3 for s in shots),
    ]


def matches(shots, box):
    values = [box.get(k) for k in BOX_KEYS]
    return (
        all(
            isinstance(v, (int, float))
            and not isinstance(v, bool)
            and math.isfinite(v)
            and v >= 0
            for v in values
        )
        and counts(shots) == values
    )


def summarize(shots):
    attempts, made, threes, threes_made = counts(shots)
    return {
        "attempts": attempts,
        "made": made,
        "threes": threes,
        "threes_made": threes_made,
        "located": sum(s["location_status"] == "located" for s in shots),
    }


def build(source, conn, path, receipt, season, write_public=True):
    conn.executescript(
        (ROOT / "worker/migrations/0011_basketball_shooting.sql").read_text()
    )
    conn.executescript(
        "DROP TABLE IF EXISTS shot_stage; CREATE TABLE shot_stage(game_id TEXT,event_id TEXT,payload_json TEXT,PRIMARY KEY(game_id,event_id));"
    )
    games, boxes, _ = load_games(source)
    games = {g["id"]: g for g in games if g["season"] == season and g["completed"]}
    box_receipts = [
        json.loads(r[0])
        for r in source.execute(
            "SELECT receipt_json FROM bb_sources WHERE season=? AND dataset IN ('schedule','team_box','player_box') ORDER BY dataset",
            (season,),
        )
    ]
    if len(box_receipts) != 3:
        raise ValueError(
            "Import schedule, team boxes and player boxes for this season first"
        )
    edition = hashlib.sha256(
        dumps(
            {
                "pbp": receipt["sha256"],
                "boxes": [(r["dataset"], r["sha256"]) for r in box_receipts],
                "version": 1,
            }
        ).encode()
    ).hexdigest()
    player_boxes = {
        (r["game_id"], r["team_id"], r["athlete_id"]): json.loads(r["stats_json"])
        for r in source.execute("SELECT * FROM bb_player_box WHERE season=?", (season,))
    }
    team_box_games = Counter(tid for gid, tid in boxes if gid in games)
    player_box_games = Counter(
        pid
        for (gid, tid, pid), box in player_boxes.items()
        if gid in games and (box.get("field_goals_attempted") or 0) > 0
    )
    audit = Counter()
    conflicted = set()
    all_pbp_games = set()
    with conn:
        for batch in pq.ParquetFile(path).iter_batches(
            batch_size=8192, columns=COLUMNS
        ):
            for row in batch.to_pylist():
                audit["source_events"] += 1
                gid = identity(row["game_id"])
                all_pbp_games.add(gid)
                game = games.get(gid)
                if not game or row["season"] != season:
                    audit["events_outside_completed_schedule"] += 1
                    continue
                shot, reason = normalize(row, game)
                if shot is None:
                    audit[reason] += 1
                    continue
                payload = dumps(shot)
                old = conn.execute(
                    "SELECT payload_json FROM shot_stage WHERE game_id=? AND event_id=?",
                    (gid, shot["id"]),
                ).fetchone()
                if old:
                    audit["duplicate_events"] += 1
                    if old[0] != payload:
                        conflicted.add(gid)
                        audit["conflicting_duplicates"] += 1
                    continue
                conn.execute(
                    "INSERT INTO shot_stage VALUES (?,?,?)", (gid, shot["id"], payload)
                )
    profiles = {}
    locations = Counter()
    game_ids = [r[0] for r in conn.execute("SELECT DISTINCT game_id FROM shot_stage")]

    def entity(kind, eid, name):
        key = (kind, eid)
        if key not in profiles:
            profiles[key] = {
                "id": eid,
                "kind": kind,
                "name": name,
                "teams": set(),
                "games": [],
                "all": Counter(),
                "matched": Counter(),
            }
        return profiles[key]

    with conn:
        for table in ("bb_shot_games", "bb_shot_profiles", "bb_shot_sources"):
            conn.execute(f"DELETE FROM {table} WHERE season=?", (season,))
        for gid in game_ids:
            game = games[gid]
            shots = sorted(
                [
                    json.loads(r[0])
                    for r in conn.execute(
                        "SELECT payload_json FROM shot_stage WHERE game_id=?", (gid,)
                    )
                ],
                key=lambda s: (s["order"], s["id"]),
            )
            team_groups, player_groups = defaultdict(list), defaultdict(list)
            for shot in shots:
                team_groups[shot["team"]].append(shot)
                if shot["player"]:
                    player_groups[(shot["team"], shot["player"])].append(shot)
                else:
                    audit["unresolved_player_attempts"] += 1
                locations[shot["location_status"]] += 1
            team_match = {
                tid: gid not in conflicted and matches(group, boxes.get((gid, tid), {}))
                for tid, group in team_groups.items()
            }
            player_match = {
                key: team_match[key[0]]
                and matches(group, player_boxes.get((gid, *key), {}))
                for key, group in player_groups.items()
            }
            audit["team_games"] += len(team_groups)
            audit["matched_team_games"] += sum(team_match.values())
            audit["player_games"] += len(player_groups)
            audit["matched_player_games"] += sum(player_match.values())
            for shot in shots:
                shot["team_match"] = team_match[shot["team"]]
                shot["player_match"] = player_match.get(
                    (shot["team"], shot["player"]), False
                )
                shot.pop("player_name", None)
                shot.pop("order", None)
            meta = {
                "id": gid,
                "date": game["starts_at"],
                "home": game["home_name"],
                "away": game["away_name"],
                "home_id": game["home_id"],
                "away_id": game["away_id"],
            }
            for part, start in enumerate(range(0, len(shots), 100)):
                conn.execute(
                    "INSERT INTO bb_shot_games VALUES (?,?,?,?,?)",
                    (edition, season, gid, part, dumps(shots[start : start + 100])),
                )
            for tid, group in team_groups.items():
                name = (
                    game["home_name"] if tid == game["home_id"] else game["away_name"]
                )
                p = entity("team", tid, name)
                p["teams"].add(tid)
                summary = summarize(group)
                p["games"].append(
                    {**meta, "team": tid, "matched": team_match[tid], **summary}
                )
                p["all"].update(summary)
                if team_match[tid]:
                    p["matched"].update(summary)
            for (tid, pid), group in player_groups.items():
                row = source.execute(
                    "SELECT name FROM bb_players WHERE id=?", (pid,)
                ).fetchone()
                p = entity("player", pid, row[0] if row else pid)
                p["teams"].add(tid)
                summary = summarize(group)
                p["games"].append(
                    {
                        **meta,
                        "team": tid,
                        "matched": player_match[(tid, pid)],
                        **summary,
                    }
                )
                p["all"].update(summary)
                if player_match[(tid, pid)]:
                    p["matched"].update(summary)
        for (kind, eid), p in profiles.items():
            p["teams"] = sorted(p["teams"])
            p["games"].sort(key=lambda g: (g["date"], g["id"]))
            p["season"] = season
            p["source_sha256"] = receipt["sha256"]
            p["box_games"] = (
                team_box_games[eid] if kind == "team" else player_box_games[eid]
            )
            conn.execute(
                "INSERT INTO bb_shot_profiles VALUES (?,?,?,?,?)",
                (edition, season, kind, eid, dumps(p)),
            )
        audit["source_games"] = len(all_pbp_games)
        audit["shot_games"] = len(game_ids)
        audit["schedule_completed_games"] = len(games)
        audit["field_goal_attempts"] = conn.execute(
            "SELECT count(*) FROM shot_stage"
        ).fetchone()[0]
        coverage = {
            "edition": edition,
            **audit,
            "locations": dict(locations),
            "teams": sum(k[0] == "team" for k in profiles),
            "players": sum(k[0] == "player" for k in profiles),
        }
        conn.execute(
            "INSERT INTO bb_shot_sources VALUES (?,?,?,?)",
            (
                season,
                edition,
                dumps({**receipt, "box_sources": box_receipts}),
                dumps(coverage),
            ),
        )
    index = {
        "season": season,
        "generated_at": utcnow(),
        "source": receipt,
        "coverage": coverage,
        "teams": [],
        "players": [],
    }
    for (kind, _), p in profiles.items():
        index[kind + "s"].append(
            {k: p[k] for k in ("id", "name", "teams", "all", "matched", "box_games")}
        )
    for kind in ("teams", "players"):
        index[kind].sort(key=lambda p: p["name"])
    if write_public:
        (OUT / "shooting.json").write_text(dumps(index))
    return index


def export(conn, season, directory):
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob("shots-*.sql"):
        old.unlink()
    statements = []
    part, size = 0, sum(map(len, statements))
    for table in ("bb_shot_games", "bb_shot_profiles", "bb_shot_sources"):
        for row in conn.execute(f"SELECT * FROM {table} WHERE season=?", (season,)):
            sql = (
                f"INSERT OR REPLACE INTO {table} VALUES ("
                + ",".join(
                    str(v) if isinstance(v, int) else "'" + v.replace("'", "''") + "'"
                    for v in row
                )
                + ");\n"
            )
            if len(sql.encode()) > 95000:
                raise ValueError("Statement exceeds safe D1 import size")
            if size + len(sql) > 8_000_000:
                (directory / f"shots-{part:03d}.sql").write_text("".join(statements))
                part += 1
                statements = []
                size = 0
            statements.append(sql)
            size += len(sql)
    if statements:
        (directory / f"shots-{part:03d}.sql").write_text("".join(statements))
    edition = conn.execute(
        "SELECT edition FROM bb_shot_sources WHERE season=?", (season,)
    ).fetchone()[0]
    manifest = {
        "season": season,
        "edition": edition,
        "files": [
            {"name": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(directory.glob("shots-*.sql"))
        ],
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2))


def export_all(conn, seasons, directory):
    """Export immutable SQL batches for every published shooting season."""
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob("shots-*.sql"):
        old.unlink()
    files = []
    for season in seasons:
        statements = []
        size = 0
        part = 0
        for table in ("bb_shot_games", "bb_shot_profiles", "bb_shot_sources"):
            for row in conn.execute(
                f"SELECT * FROM {table} WHERE season=?", (season,)
            ):
                sql = (
                    f"INSERT OR REPLACE INTO {table} VALUES ("
                    + ",".join(
                        str(v)
                        if isinstance(v, int)
                        else "'" + v.replace("'", "''") + "'"
                        for v in row
                    )
                    + ");\n"
                )
                if len(sql.encode()) > 95000:
                    raise ValueError("Statement exceeds safe D1 import size")
                if size + len(sql) > 8_000_000:
                    target = directory / f"shots-{season}-{part:03d}.sql"
                    target.write_text("".join(statements))
                    files.append(target)
                    part += 1
                    statements = []
                    size = 0
                statements.append(sql)
                size += len(sql)
        if statements:
            target = directory / f"shots-{season}-{part:03d}.sql"
            target.write_text("".join(statements))
            files.append(target)
    editions = {
        season: conn.execute(
            "SELECT edition FROM bb_shot_sources WHERE season=?", (season,)
        ).fetchone()[0]
        for season in seasons
    }
    manifest = {
        "seasons": list(seasons),
        "editions": editions,
        "files": [
            {
                "name": path.name,
                "season": next(
                    season for season in seasons if path.name.startswith(f"shots-{season}-")
                ),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
            for path in files
        ],
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--seasons", type=int, nargs="+")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--sql", action="store_true")
    args = parser.parse_args()
    source = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    conn = sqlite3.connect(SHOT_DB)
    seasons = args.seasons or [args.season]
    indexes = []
    for season in seasons:
        path, receipt = parquet_file(client(), "pbp", season, args.refresh)
        indexes.append(build(source, conn, path, receipt, season, write_public=False))
    data = max(indexes, key=lambda index: index["season"])
    (OUT / "shooting.json").write_text(dumps(data))
    if len(indexes) > 1:
        (OUT / "shooting-catalog.json").write_text(
            dumps(
                {
                    "schema_version": 1,
                    "default_season": data["season"],
                    "seasons": indexes,
                }
            )
        )
    if args.sql:
        if len(seasons) > 1:
            export_all(conn, seasons, ROOT / ".local/shooting-sql")
        else:
            export(conn, seasons[0], ROOT / ".local/shooting-sql")
    print(json.dumps({"seasons": seasons, "coverage": [i["coverage"] for i in indexes]}, indent=2))
    conn.close()
    source.close()


if __name__ == "__main__":
    main()
