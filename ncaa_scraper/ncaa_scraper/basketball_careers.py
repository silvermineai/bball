"""Versioned historical player production from attributed bulk box-score releases."""

import argparse
import fcntl
import hashlib
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone

import pyarrow.parquet as pq

from .basketball_sources import BASKETBALL_ATTRIBUTION, client
from .bulk_parquet import parquet_file
from .football_sources import ROOT, utcnow

DB = ROOT / ".local/basketball-careers.sqlite3"
OUT = ROOT / "frontend/public/data/basketball/history"
VERSION = 1
FIELDS = {
    "min": "minutes",
    "pts": "points",
    "fgm": "field_goals_made",
    "fga": "field_goals_attempted",
    "tpm": "three_point_field_goals_made",
    "tpa": "three_point_field_goals_attempted",
    "ftm": "free_throws_made",
    "fta": "free_throws_attempted",
    "orb": "offensive_rebounds",
    "drb": "defensive_rebounds",
    "reb": "rebounds",
    "ast": "assists",
    "stl": "steals",
    "blk": "blocks",
    "tov": "turnovers",
    "pf": "fouls",
}


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def identifier(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer() or value >= 2**53:
            return None
        value = int(value)
    text = str(value)
    return text if re.fullmatch(r"[1-9][0-9]{0,14}", text) else None


def numeric(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (ValueError, TypeError):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def boolean(value):
    if value is True or value == "true":
        return True
    if value is False or value == "false":
        return False
    return None


def timestamp(value):
    if value is None:
        return None
    try:
        dt = (
            value
            if isinstance(value, datetime)
            else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        )
        if dt.tzinfo is None:
            return None
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def schedule_index(rows, season):
    result = {}
    for row in rows:
        gid = identifier(row.get("game_id"))
        if not gid or numeric(row.get("season")) != season:
            continue
        game = {
            "id": gid,
            "date": timestamp(row.get("date")),
            "home_id": identifier(row.get("home_id")),
            "away_id": identifier(row.get("away_id")),
            "home": row.get("home_short_display_name") or row.get("home_display_name"),
            "away": row.get("away_short_display_name") or row.get("away_display_name"),
            "home_score": numeric(row.get("home_score")),
            "away_score": numeric(row.get("away_score")),
            "completed": boolean(row.get("status_type_completed")) is True,
            "neutral": boolean(row.get("neutral_site")),
        }
        if gid in result and result[gid] != game:
            raise ValueError(f"Conflicting schedule rows for {gid}")
        result[gid] = game
    return result


def normalize(row, schedule, season):
    aid, gid, tid = [
        identifier(row.get(k)) for k in ("athlete_id", "game_id", "team_id")
    ]
    if not all((aid, gid, tid)):
        return None, "missing_identity"
    if numeric(row.get("season")) != season:
        return None, "wrong_season"
    game = schedule.get(gid)
    matched = bool(game and tid in (game["home_id"], game["away_id"]))
    home = matched and tid == game["home_id"]
    side, opponent_side = ("home", "away") if home else ("away", "home")
    stats = {k: numeric(row.get(v)) for k, v in FIELDS.items()}
    # Impossible shooting count combinations do not become valid shooting rates.
    issues = []
    for made, attempted in [("fgm", "fga"), ("tpm", "tpa"), ("ftm", "fta")]:
        if (
            stats[made] is not None
            and stats[attempted] is not None
            and stats[made] > stats[attempted]
        ):
            issues.append(f"{made}_exceeds_{attempted}")
            stats[made] = stats[attempted] = None
    if (
        stats["tpm"] is not None
        and stats["fgm"] is not None
        and stats["tpm"] > stats["fgm"]
    ):
        issues.append("three_makes_exceed_field_goals")
        stats["tpm"] = stats["fgm"] = None
    if (
        stats["tpa"] is not None
        and stats["fga"] is not None
        and stats["tpa"] > stats["fga"]
    ):
        issues.append("three_attempts_exceed_field_goals")
        stats["tpa"] = stats["fga"] = None
    dnp = boolean(row.get("did_not_play"))
    if dnp is True and (stats["min"] or 0) > 0:
        issues.append("dnp_with_minutes")
    completed = bool(matched and game["completed"])
    appearance = completed and dnp is not True and (stats["min"] or 0) > 0
    log = {
        "id": gid,
        "team_id": tid,
        "team": (game[side] if matched else None)
        or row.get("team_short_display_name")
        or row.get("team_display_name")
        or tid,
        "opponent_id": game[opponent_side + "_id"]
        if matched
        else identifier(row.get("opponent_team_id")),
        "opponent": game[opponent_side]
        if matched
        else row.get("opponent_team_display_name"),
        "date": game["date"] if matched else timestamp(row.get("game_date_time")),
        "venue": ("neutral" if game["neutral"] else "home" if home else "away")
        if matched
        else None,
        "score_for": game[side + "_score"] if completed else None,
        "score_against": game[opponent_side + "_score"] if completed else None,
        "schedule_matched": matched,
        "completed": completed,
        "appearance": appearance,
        "dnp": dnp,
        "starter": boolean(row.get("starter")),
        "stats": stats,
        "issues": issues,
    }
    return {
        "athlete_id": aid,
        "name": row.get("athlete_display_name") or aid,
        "position": row.get("athlete_position_abbreviation"),
        "log": log,
    }, None


def summarize(logs):
    played = [r for r in logs if r["appearance"]]
    games = len(played)
    samples = {k: sum(r["stats"][k] is not None for r in played) for k in FIELDS}
    totals = {
        k: sum(r["stats"][k] for r in played) if games and samples[k] == games else None
        for k in FIELDS
    }

    def rate(keys, calculation):
        if not games or any(totals[k] is None for k in keys):
            return None
        return calculation()

    def ratio(a, b):
        return a / b if b else None

    rates = {
        k + "pg": rate([field], lambda f=field: totals[f] / games)
        for k, field in [
            ("m", "min"),
            ("p", "pts"),
            ("r", "reb"),
            ("a", "ast"),
            ("s", "stl"),
            ("b", "blk"),
            ("to", "tov"),
        ]
    }
    rates.update(
        {
            "efg": rate(
                ["fgm", "tpm", "fga"],
                lambda: ratio(totals["fgm"] + 0.5 * totals["tpm"], totals["fga"]),
            ),
            "ts": rate(
                ["pts", "fga", "fta"],
                lambda: ratio(
                    totals["pts"], 2 * (totals["fga"] + 0.475 * totals["fta"])
                ),
            ),
            "three_pct": rate(
                ["tpm", "tpa"], lambda: ratio(totals["tpm"], totals["tpa"])
            ),
            "ft_pct": rate(["ftm", "fta"], lambda: ratio(totals["ftm"], totals["fta"])),
            "three_rate": rate(
                ["tpa", "fga"], lambda: ratio(totals["tpa"], totals["fga"])
            ),
            "ft_rate": rate(
                ["fta", "fga"], lambda: ratio(totals["fta"], totals["fga"])
            ),
            "tov_rate": rate(
                ["tov", "fga", "fta"],
                lambda: ratio(
                    totals["tov"],
                    totals["fga"] + 0.475 * totals["fta"] + totals["tov"],
                ),
            ),
        }
    )
    return {
        "games": games,
        "source_records": len(logs),
        "totals": totals,
        "samples": samples,
        "incomplete_box_games": sum(
            any(r["stats"][k] is None for k in FIELDS) for r in played
        ),
        "dnp_records": sum(r["dnp"] is True for r in logs),
        "excluded_records": sum(not r["appearance"] for r in logs),
        "qualified": games >= 15
        and (totals["min"] or 0) >= 400
        and all(samples[k] == games for k in FIELDS),
        **rates,
    }


def ingest_season(conn, season, box_rows, schedule_rows, receipts):
    schedule = schedule_index(schedule_rows, season)
    players = defaultdict(dict)
    names = {}
    counts = Counter(
        source_rows=0, missing_identity=0, wrong_season=0, duplicate_rows=0
    )
    for row in box_rows:
        counts["source_rows"] += 1
        record, reason = normalize(row, schedule, season)
        if reason:
            counts[reason] += 1
            continue
        aid, log = record["athlete_id"], record["log"]
        key = (log["id"], log["team_id"])
        if key in players[aid]:
            if players[aid][key] != log:
                raise ValueError(f"Conflicting player box rows: {season}/{aid}/{key}")
            counts["duplicate_rows"] += 1
            continue
        players[aid][key] = log
        # Latest dated source appearance controls this season's display identity.
        candidate = (log["date"] or "", record["name"], record["position"] or "")
        if aid not in names or candidate > names[aid]:
            names[aid] = candidate
    edition = digest(
        {
            "version": VERSION,
            "season": season,
            "sources": [r["sha256"] for r in receipts],
        }
    )
    index = []
    observed_games = set()
    identified_games = set()
    all_logs = [log for mapping in players.values() for log in mapping.values()]
    appearance_logs = [log for log in all_logs if log["appearance"]]
    field_coverage = {
        key: {
            "source_rows": len(all_logs),
            "source_observed": sum(log["stats"][key] is not None for log in all_logs),
            "source_share": (sum(log["stats"][key] is not None for log in all_logs) / len(all_logs)) if all_logs else None,
            "appearance_rows": len(appearance_logs),
            "appearance_observed": sum(log["stats"][key] is not None for log in appearance_logs),
            "appearance_share": (sum(log["stats"][key] is not None for log in appearance_logs) / len(appearance_logs)) if appearance_logs else None,
        }
        for key in FIELDS
    }
    with conn:
        for aid, mapping in players.items():
            logs = sorted(
                mapping.values(),
                key=lambda r: (r["date"] or "", r["id"], r["team_id"]),
                reverse=True,
            )
            _, name, position = names[aid]
            for log in logs:
                identified_games.add(log["id"])
                if log["appearance"]:
                    observed_games.add(log["id"])
                for counter, condition in [
                    ("identified_rows", True),
                    ("schedule_matched_rows", log["schedule_matched"]),
                    ("appearance_rows", log["appearance"]),
                    ("dnp_rows", log["dnp"] is True),
                    ("invalid_stat_rows", bool(log["issues"])),
                ]:
                    counts[counter] += condition
            teams = []
            for tid in sorted({r["team_id"] for r in logs}):
                team_logs = [r for r in logs if r["team_id"] == tid]
                summary = summarize(team_logs)
                teams.append({"team_id": tid, "team": team_logs[0]["team"], **summary})
                if summary["games"]:
                    index.append(
                        {
                            "id": aid,
                            "name": name,
                            "position": position or None,
                            "season": season,
                            "team_id": tid,
                            "team": team_logs[0]["team"],
                            **{
                                k: summary[k]
                                for k in [
                                    "games",
                                    "mpg",
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
                                    "qualified",
                                    "incomplete_box_games",
                                ]
                            },
                            "minutes": summary["totals"]["min"],
                        }
                    )
            profile = {
                "id": aid,
                "name": name,
                "position": position or None,
                "season": season,
                "teams": teams,
                "overall": summarize(logs),
            }
            conn.execute(
                "INSERT OR REPLACE INTO bb_career_profiles VALUES (?,?,?,?)",
                (edition, season, aid, dumps(profile)),
            )
            # A whole season can have many source rows; bound every SQL insert and API read.
            for start in range(0, len(logs), 40):
                conn.execute(
                    "INSERT OR REPLACE INTO bb_career_logs VALUES (?,?,?,?,?)",
                    (
                        edition,
                        season,
                        aid,
                        start // 40,
                        dumps(logs[start : start + 40]),
                    ),
                )
        coverage = {
            "season": season,
            "edition": edition,
            **counts,
            "player_ids": len(players),
            "player_team_entries": len(index),
            "qualified_entries": sum(p["qualified"] for p in index),
            "schedule_games": len(schedule),
            "completed_schedule_games": sum(g["completed"] for g in schedule.values()),
            "box_games": len(identified_games),
            "appearance_games": len(observed_games),
            "field_coverage": field_coverage,
        }
        conn.execute(
            "INSERT OR REPLACE INTO bb_career_seasons VALUES (?,?,?,?)",
            (season, edition, dumps(receipts), dumps(coverage)),
        )
    index.sort(
        key=lambda p: (-(p["ppg"] if p["ppg"] is not None else -1), p["name"], p["id"])
    )
    return {
        "season": season,
        "edition": edition,
        "players": index,
        "coverage": coverage,
    }


def parquet_rows(path):
    for batch in pq.ParquetFile(path).iter_batches(batch_size=4096):
        yield from batch.to_pylist()


def sql_value(value):
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def acquire_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    handle = (directory / ".sync.lock").open("a")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise RuntimeError(
            "A career export or sync is active; let that process finish"
        ) from None
    return handle


def batch_is_current(record, active):
    editions = record.get("seasons", {})
    return bool(editions) and all(
        active.get(year) == edition for year, edition in editions.items()
    )


def export(conn, directory, catalog, indexes=None):
    with acquire_lock(directory):
        _export(conn, directory, catalog, indexes)


def _export(conn, directory, catalog, indexes):
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob("careers-*.sql"):
        old.unlink()
    statements, size, part = [], 0, 0
    files = []
    batch_editions = {}

    def flush():
        nonlocal statements, size, part, batch_editions
        if statements:
            path = directory / f"careers-{part:04d}.sql"
            payload = "".join(statements).encode()
            path.write_bytes(payload)
            files.append(
                {
                    "name": path.name,
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "seasons": batch_editions,
                }
            )
            part += 1
            statements = []
            size = 0
            batch_editions = {}

    # Activate pointers after profiles and logs for EVERY selected season have uploaded.
    for table in ["bb_career_profiles", "bb_career_logs", "bb_career_seasons"]:
        query = (
            f"SELECT p.* FROM {table} p JOIN bb_career_seasons s ON s.edition=p.edition AND s.season=p.season"
            if table != "bb_career_seasons"
            else f"SELECT * FROM {table}"
        )
        for row in conn.execute(query):
            mode = "REPLACE" if table == "bb_career_seasons" else "IGNORE"
            sql = (
                f"INSERT OR {mode} INTO {table} VALUES ("
                + ",".join(sql_value(v) for v in row)
                + ");\n"
            )
            length = len(sql.encode())
            if length > 95000:
                raise ValueError("SQL statement exceeds bounded chunk size")
            if size + length > 8_000_000:
                flush()
            year, edition = (
                (row[0], row[1]) if table == "bb_career_seasons" else (row[1], row[0])
            )
            batch_editions[str(year)] = edition
            statements.append(sql)
            size += length
    flush()
    manifest = {
        "catalog_sha256": digest(catalog),
        "files": files,
        "indexes": indexes or {},
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-season", type=int, default=2003)
    parser.add_argument("--end-season", type=int, default=2026)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--sql", action="store_true")
    args = parser.parse_args()
    if not 2003 <= args.start_season <= args.end_season <= 2026:
        parser.error("Use published season-ending years 2003–2026")
    lock_handle = acquire_lock(ROOT / ".local/careers-sql")
    OUT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.executescript(
        (ROOT / "worker/migrations/0013_basketball_careers.sql").read_text()
    )
    previous_manifest = ROOT / ".local/careers-sql/manifest.json"
    previous_indexes = (
        json.loads(previous_manifest.read_text()).get("indexes", {})
        if previous_manifest.exists()
        else {}
    )
    c = client()
    for season in range(args.start_season, args.end_season + 1):
        sp, sr = parquet_file(c, "schedule", season, args.refresh)
        bp, br = parquet_file(c, "player_box", season, args.refresh)
        # A cached participation receipt can refer to the same file under another dataset name.
        sr = {**sr, "dataset": "schedule"}
        br = {**br, "dataset": "player_box"}
        edition = digest(
            {
                "version": VERSION,
                "season": season,
                "sources": [sr["sha256"], br["sha256"]],
            }
        )
        active = conn.execute(
            "SELECT edition FROM bb_career_seasons WHERE season=?", (season,)
        ).fetchone()
        path = OUT / f"players-{season}.json"
        if (
            active
            and active[0] == edition
            and path.exists()
            and previous_indexes.get(path.name)
            == hashlib.sha256(path.read_bytes()).hexdigest()
            and json.loads(path.read_text()).get("edition") == edition
        ):
            print(f"Using verified career season {season}", flush=True)
            continue
        result = ingest_season(
            conn, season, parquet_rows(bp), parquet_rows(sp), [sr, br]
        )
        path.write_text(dumps(result))
        print(dumps(result["coverage"]), flush=True)
    seasons = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT coverage_json FROM bb_career_seasons ORDER BY season DESC"
        )
    ]
    receipts = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT receipt_json FROM bb_career_seasons ORDER BY season DESC"
        )
    ]
    catalog = {
        "generated_at": utcnow(),
        "version": VERSION,
        "seasons": seasons,
        "sources": receipts,
        "attribution": BASKETBALL_ATTRIBUTION,
        "player_ids": conn.execute(
            "SELECT count(DISTINCT p.athlete_id) FROM bb_career_profiles p JOIN bb_career_seasons s ON s.edition=p.edition AND s.season=p.season"
        ).fetchone()[0],
        "limitations": [
            "Historical source releases are retrospective snapshots, not proof of what was known before a game.",
            "Names never join source IDs. Differing names or a source span beyond eight years require identity review; those records are not asserted to be one career.",
            "Coverage varies by season and includes some opponents outside Division I.",
            "Season rates require recorded positive minutes and a completed, matching schedule entry. DNP and unmatched rows remain in logs.",
            "Missing statistic fields remain unavailable, not zero. Qualification requires 15 games, 400 minutes and complete box fields.",
            "The earliest and latest recorded appearances are not necessarily a player’s entire college career.",
        ],
    }
    (OUT / "index.json").write_text(dumps(catalog))
    if args.sql:
        indexes = {
            f"players-{s['season']}.json": hashlib.sha256(
                (OUT / f"players-{s['season']}.json").read_bytes()
            ).hexdigest()
            for s in seasons
        }
        _export(conn, ROOT / ".local/careers-sql", catalog, indexes)
    conn.close()
    lock_handle.close()


if __name__ == "__main__":
    main()
