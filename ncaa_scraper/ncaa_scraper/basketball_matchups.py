"""Build a compact, source-audited archive of five-player matchup stints."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

from .basketball_sources import client
from .bulk_parquet import parquet_file
from .football_sources import ROOT, utcnow

OUT = ROOT / "frontend/public/data/basketball/matchup-stints.json"
SEASON_OUT = ROOT / "frontend/public/data/basketball"
SEASONS = tuple(range(2019, 2027))
MAX_PUBLIC_MATCHUPS = 5000
COLUMNS = [
    "contest_id",
    "season",
    "game_date",
    "home",
    "away",
    "duration_seconds",
    "home_lineup_key",
    "away_lineup_key",
    "home_lineup",
    "away_lineup",
    "n_events",
    "n_possessions",
    "home_pts",
    "away_pts",
]


def text(value):
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def player_names(value):
    if not value:
        return []
    return [part.replace(".", " ").title() for part in str(value).split("|") if part]


def aggregate(path: Path, receipt: dict, season: int, limit: int = MAX_PUBLIC_MATCHUPS) -> dict:
    groups: dict[tuple[str, str, str, str], dict] = {}
    source_rows = 0
    source_contests: set[str] = set()
    source_possessions = 0
    for batch in pq.ParquetFile(path).iter_batches(batch_size=8192, columns=COLUMNS):
        for row in batch.to_pylist():
            if row.get("season") != season:
                continue
            home_key = row.get("home_lineup_key")
            away_key = row.get("away_lineup_key")
            if not home_key or not away_key or not row.get("home") or not row.get("away"):
                continue
            source_rows += 1
            contest = str(row.get("contest_id"))
            source_contests.add(contest)
            possessions = int(row.get("n_possessions") or 0)
            source_possessions += possessions
            key = (str(row["home"]), str(row["away"]), str(home_key), str(away_key))
            group = groups.setdefault(
                key,
                {
                    "season": season,
                    "home": str(row["home"]),
                    "away": str(row["away"]),
                    "home_lineup": player_names(row.get("home_lineup")),
                    "away_lineup": player_names(row.get("away_lineup")),
                    "home_lineup_key": str(home_key),
                    "away_lineup_key": str(away_key),
                    "games": set(),
                    "stints": 0,
                    "duration_seconds": 0,
                    "events": 0,
                    "possessions": 0,
                    "home_points": 0,
                    "away_points": 0,
                    "last_date": text(row.get("game_date")),
                },
            )
            group["games"].add(contest)
            group["stints"] += 1
            group["duration_seconds"] += int(row.get("duration_seconds") or 0)
            group["events"] += int(row.get("n_events") or 0)
            group["possessions"] += possessions
            group["home_points"] += int(row.get("home_pts") or 0)
            group["away_points"] += int(row.get("away_pts") or 0)
            if text(row.get("game_date")) and text(row.get("game_date")) > (group["last_date"] or ""):
                group["last_date"] = text(row.get("game_date"))
    rows = []
    for group in groups.values():
        possessions = group.pop("possessions")
        group["possessions"] = possessions
        group["games"] = len(group["games"])
        group["duration_mins"] = round(group.pop("duration_seconds") / 60, 2)
        group["net_per_100"] = round(
            100 * (group["home_points"] - group["away_points"]) / possessions, 4
        ) if possessions else None
        group["home_per_100"] = round(100 * group["home_points"] / possessions, 4) if possessions else None
        group["away_per_100"] = round(100 * group["away_points"] / possessions, 4) if possessions else None
        group["id"] = hashlib.sha256(
            json.dumps(
                [season, group["home"], group["away"], group["home_lineup_key"], group["away_lineup_key"]]
            ).encode()
        ).hexdigest()[:16]
        rows.append(group)
    rows.sort(key=lambda row: (-row["possessions"], -row["games"], row["home"], row["away"], row["id"]))
    edition = hashlib.sha256(
        json.dumps({"source": receipt["sha256"], "season": season, "version": 1}, sort_keys=True).encode()
    ).hexdigest()
    return {
        "season": season,
        "generated_at": utcnow(),
        "source": receipt,
        "coverage": {
            "edition": edition,
            "source_rows": source_rows,
            "source_contests": len(source_contests),
            "source_matchups": len(groups),
            "source_possessions": source_possessions,
            "published_matchups": min(limit, len(rows)),
            "truncated": len(rows) > limit,
        },
        "matchups": rows[:limit],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, nargs="+", default=list(SEASONS))
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--limit", type=int, default=MAX_PUBLIC_MATCHUPS)
    args = parser.parse_args()
    source_client = client()
    editions = []
    for season in sorted(set(args.seasons)):
        path, receipt = parquet_file(source_client, "ncaa_matchup_stints", season, args.refresh)
        edition = aggregate(path, receipt, season, max(100, min(args.limit, 20000)))
        editions.append(edition)
        print(json.dumps({"season": season, **edition["coverage"]}), flush=True)
    for edition in editions:
        (SEASON_OUT / f"matchup-stints-{edition['season']}.json").write_text(
            json.dumps(edition, separators=(",", ":"), allow_nan=False)
        )
    catalog = {
        "schema_version": 1,
        "default_season": max(e["season"] for e in editions),
        "seasons": [
            {
                "season": edition["season"],
                "generated_at": edition["generated_at"],
                "source": edition["source"],
                "coverage": edition["coverage"],
                "path": f"/data/basketball/matchup-stints-{edition['season']}.json",
            }
            for edition in editions
        ],
    }
    OUT.write_text(json.dumps(catalog, separators=(",", ":"), allow_nan=False))
    print(json.dumps({"output": str(OUT), "seasons": [e["season"] for e in editions]}))


if __name__ == "__main__":
    main()
