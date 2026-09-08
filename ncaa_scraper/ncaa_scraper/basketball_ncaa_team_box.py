"""Build season-level NCAA team profiles from the attributed team box release."""

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

OUT = ROOT / "frontend/public/data/basketball/ncaa-team-box.json"
SEASON_OUT = ROOT / "frontend/public/data/basketball"
SEASONS = tuple(range(2010, 2027))

SUM_FIELDS = {
    "o_poss", "d_poss", "pts", "d_pts", "fga", "d_fga", "fgm", "d_fgm",
    "tpa", "d_tpa", "tpm", "d_tpm", "fta", "d_fta", "ftm", "d_ftm",
    "rima", "d_rima", "rimm", "d_rimm", "orb", "d_orb", "drb", "d_drb",
    "blk", "d_blk", "to", "d_to", "ast", "d_ast", "e_poss",
}
AVERAGE_FIELDS = {
    "mins", "o_mins", "d_mins", "ortg", "drtg", "netrtg", "fg_pct", "d_fg_pct",
    "tpp", "d_tpp", "ftp", "d_ftp", "efg_pct", "d_efg_pct", "ts_pct", "d_ts_pct",
    "rim_pct", "d_rim_pct", "mid_pct", "d_mid_pct", "tp_rate", "d_tp_rate",
    "rim_rate", "d_rim_rate", "mid_rate", "d_mid_rate", "ft_rate", "d_ft_rate",
    "ast_rate", "d_ast_rate", "to_rate", "d_to_rate", "blk_rate", "o_blk_rate",
    "orb_pct", "drb_pct", "time_per_poss", "d_time_per_poss",
}
COLUMNS = [
    "team", "team_ncaa_team_id", "team_espn_team_id", "contest_id", "season",
    *sorted(SUM_FIELDS | AVERAGE_FIELDS),
]


def numeric(value):
    return None if value is None else float(value)


def ratio(numerator, denominator):
    return round(numerator / denominator, 6) if denominator else None


def aggregate(path: Path, receipt: dict, season: int) -> dict:
    groups = {}
    source_contests = set()
    parquet = pq.ParquetFile(path)
    available = set(parquet.schema_arrow.names)
    columns = [column for column in COLUMNS if column in available]
    for batch in parquet.iter_batches(batch_size=8192, columns=columns):
        for source in batch.to_pylist():
            if int(source.get("season") or 0) != season:
                continue
            team_id = str(source.get("team_ncaa_team_id") or "").strip()
            team = str(source.get("team") or "").strip()
            if not team_id or not team:
                continue
            group = groups.setdefault(team_id, {
                "season": season,
                "team_id": team_id,
                "espn_team_id": source.get("team_espn_team_id"),
                "team": team,
                "games": 0,
                "contests": set(),
                "totals": defaultdict(float),
                "total_counts": defaultdict(int),
                "averages": defaultdict(float),
                "average_counts": defaultdict(int),
            })
            group["games"] += 1
            if source.get("contest_id"):
                contest_id = str(source["contest_id"])
                group["contests"].add(contest_id)
                source_contests.add(contest_id)
            for field in SUM_FIELDS:
                value = numeric(source.get(field))
                if value is not None:
                    group["totals"][field] += value
                    group["total_counts"][field] += 1
            for field in AVERAGE_FIELDS:
                value = numeric(source.get(field))
                if value is not None:
                    group["averages"][field] += value
                    group["average_counts"][field] += 1
    rows = []
    for group in groups.values():
        totals = {field: round(value, 4) for field, value in group["totals"].items()}
        averages = {
            field: round(value / group["average_counts"][field], 6)
            for field, value in group["averages"].items()
        }
        o_poss, d_poss = totals.get("o_poss", 0), totals.get("d_poss", 0)
        pts, d_pts = totals.get("pts", 0), totals.get("d_pts", 0)
        fga, d_fga = totals.get("fga", 0), totals.get("d_fga", 0)
        fgm, d_fgm = totals.get("fgm", 0), totals.get("d_fgm", 0)
        tpm, d_tpm = totals.get("tpm", 0), totals.get("d_tpm", 0)
        fta, d_fta = totals.get("fta", 0), totals.get("d_fta", 0)
        to, d_to = totals.get("to", 0), totals.get("d_to", 0)
        orb, d_orb = totals.get("orb", 0), totals.get("d_orb", 0)
        drb, d_drb = totals.get("drb", 0), totals.get("d_drb", 0)
        row = {
            "season": season,
            "team_id": group["team_id"],
            "espn_team_id": group["espn_team_id"],
            "team": group["team"],
            "games": group["games"],
            "contests": len(group["contests"]),
            "possessions": round((o_poss + d_poss) / 2, 2) if o_poss and d_poss else None,
            "points": round(pts, 2),
            "points_allowed": round(d_pts, 2),
            "off_rtg": ratio(100 * pts, o_poss),
            "def_rtg": ratio(100 * d_pts, d_poss),
            "net_rtg": round(ratio(100 * pts, o_poss) - ratio(100 * d_pts, d_poss), 4) if o_poss and d_poss else None,
            "tempo": round((o_poss + d_poss) / (2 * group["games"]), 4) if group["games"] else None,
            "efg_pct": ratio(fgm + 0.5 * tpm, fga),
            "def_efg_pct": ratio(d_fgm + 0.5 * d_tpm, d_fga),
            "ts_pct": ratio(pts, 2 * (fga + 0.475 * fta)),
            "def_ts_pct": ratio(d_pts, 2 * (d_fga + 0.475 * d_fta)),
            "to_rate_derived": ratio(to, fga + 0.475 * fta + to),
            "def_to_rate_derived": ratio(d_to, d_fga + 0.475 * d_fta + d_to),
            "orb_pct": ratio(orb, orb + d_drb),
            "def_orb_pct": ratio(d_orb, d_orb + drb),
            "ft_rate": ratio(fta, fga),
            "def_ft_rate": ratio(d_fta, d_fga),
            "three_rate": ratio(totals.get("tpa", 0), fga),
            "def_three_rate": ratio(totals.get("d_tpa", 0), d_fga),
            "source_totals": totals,
            "source_averages": averages,
        }
        rows.append(row)
    rows.sort(key=lambda row: (-(row["net_rtg"] if row["net_rtg"] is not None else -999), row["team"]))
    for rank, row in enumerate(rows, 1):
        row["net_rank"] = rank
    edition = hashlib.sha256(json.dumps({"source": receipt["sha256"], "season": season, "version": 1}, sort_keys=True).encode()).hexdigest()
    return {
        "season": season,
        "generated_at": utcnow(),
        "source": receipt,
        "coverage": {"source_rows": sum(row["games"] for row in rows), "teams": len(rows), "contests": len(source_contests), "edition": edition},
        "methodology": "Season profiles aggregate attributed NCAA team box records by NCAA team ID. Ratings and four-factor rates are recomputed from source counts; source averages and totals remain available for audit. These are descriptive, unadjusted team profiles and are separate from Silvermine ratings and forecasts.",
        "teams": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, nargs="+", default=list(SEASONS))
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    source_client = client()
    editions = []
    for season in sorted(set(args.seasons)):
        path, receipt = parquet_file(source_client, "ncaa_team_box", season, args.refresh)
        edition = aggregate(path, receipt, season)
        editions.append(edition)
        (SEASON_OUT / f"ncaa-team-box-{season}.json").write_text(json.dumps(edition, separators=(",", ":"), allow_nan=False))
        print(json.dumps({"season": season, **edition["coverage"]}), flush=True)
    OUT.write_text(json.dumps({"schema_version": 1, "default_season": max(e["season"] for e in editions), "seasons": [{"season": e["season"], "generated_at": e["generated_at"], "source": {"sha256": e["source"]["sha256"]}, "coverage": e["coverage"], "path": f"/data/basketball/ncaa-team-box-{e['season']}.json"} for e in editions]}, separators=(",", ":")))


if __name__ == "__main__":
    main()
