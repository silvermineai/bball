"""Publish the attributed NCAA within-team RAPM archive."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pyarrow.parquet as pq

from .basketball_sources import client
from .bulk_parquet import parquet_file
from .football_sources import ROOT, utcnow

OUT = ROOT / "frontend/public/data/basketball/impact-within-team.json"
SEASON_OUT = ROOT / "frontend/public/data/basketball"
SEASONS = tuple(range(2010, 2027))
COLUMNS = [
    "team",
    "player_code",
    "rapm_off",
    "rapm_def",
    "team_off_poss",
    "num_players",
    "rapm_net",
    "season",
    "player_id",
    "team_id",
    "person_id",
]


def number(value):
    return None if value is None else float(value)


def display_name(value):
    text = str(value or "").strip()
    if "," not in text:
        return text
    last, first = [part.strip() for part in text.split(",", 1)]
    return " ".join(part for part in (first, last) if part)


def build(path: Path, receipt: dict, season: int) -> dict:
    rows = []
    for batch in pq.ParquetFile(path).iter_batches(batch_size=4096, columns=COLUMNS):
        for source in batch.to_pylist():
            if int(source.get("season") or 0) != season:
                continue
            player_id = str(source.get("player_id") or "").strip()
            team_id = str(source.get("team_id") or "").strip()
            if not player_id or not team_id or not source.get("team"):
                continue
            row = {
                "season": season,
                "player_id": player_id,
                "person_id": source.get("person_id"),
                "team_id": team_id,
                "team": str(source["team"]),
                "player_code": str(source.get("player_code") or player_id),
                "player": display_name(source.get("player_code")),
                "rapm_off": number(source.get("rapm_off")),
                "rapm_def": number(source.get("rapm_def")),
                "rapm_net": number(source.get("rapm_net")),
                "team_off_poss": number(source.get("team_off_poss")),
                "num_players": int(source.get("num_players") or 0),
            }
            row["qualified"] = (row["team_off_poss"] or 0) >= 500
            rows.append(row)
    rows.sort(
        key=lambda row: (
            -(row["rapm_net"] if row["rapm_net"] is not None else -999),
            -row["team_off_poss"] if row["team_off_poss"] is not None else 0,
            row["team"],
            row["player"],
        )
    )
    for rank, row in enumerate((r for r in rows if r["qualified"]), 1):
        row["rank"] = rank
    for row in rows:
        row.setdefault("rank", None)
    edition = hashlib.sha256(
        json.dumps(
            {"source": receipt["sha256"], "season": season, "version": 1},
            sort_keys=True,
        ).encode()
    ).hexdigest()
    return {
        "season": season,
        "generated_at": utcnow(),
        "source": receipt,
        "coverage": {
            "source_rows": len(rows),
            "players": len({row["player_id"] for row in rows}),
            "teams": len({row["team_id"] for row in rows}),
            "qualified": sum(row["qualified"] for row in rows),
            "minimum_possessions": 500,
            "edition": edition,
        },
        "methodology": "Within-team regularized adjusted plus-minus from the attributed NCAA release. Team-relative offensive possessions qualify the display board; this is descriptive source output and is not used in the Silvermine forecast.",
        "players": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, nargs="+", default=list(SEASONS))
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    source_client = client()
    editions = []
    for season in sorted(set(args.seasons)):
        path, receipt = parquet_file(
            source_client, "ncaa_rapm_within_team", season, args.refresh
        )
        edition = build(path, receipt, season)
        editions.append(edition)
        (SEASON_OUT / f"impact-within-team-{season}.json").write_text(
            json.dumps(edition, separators=(",", ":"), allow_nan=False)
        )
        print(json.dumps({"season": season, **edition["coverage"]}), flush=True)
    OUT.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "default_season": max(edition["season"] for edition in editions),
                "seasons": [
                    {
                        "season": edition["season"],
                        "generated_at": edition["generated_at"],
                        "coverage": edition["coverage"],
                        "path": f"/data/basketball/impact-within-team-{edition['season']}.json",
                    }
                    for edition in editions
                ],
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
