"""Build a compact, source-native historical MBB standings archive.

SportsDataverse publishes one row per team and standing statistic. This module
keeps every supplied stat while compacting those rows into one team-season
record for fast browsing. The source parquet remains suitable for archival in
R2; no ESPN page is fetched directly.
"""

from __future__ import annotations

import json
from collections import OrderedDict
from pathlib import Path

from .basketball_sources import BASKETBALL_ATTRIBUTION, client
from .football import number
from .football_sources import ROOT, utcnow

OUT = ROOT / "frontend/public/data/basketball/standings.json"
YEARS = range(2003, 2027)


def _value(value):
    parsed = number(value)
    return parsed if parsed is not None else (value or None)


def build(*, refresh: bool = False, years=YEARS) -> dict:
    source = client()
    teams: OrderedDict[tuple[int, str, str], dict] = OrderedDict()
    releases = []
    for year in years:
        rows, receipt = source.load("standings", int(year), refresh=refresh)
        releases.append(
            {
                "season": int(year),
                "rows": len(rows),
                "sha256": receipt.get("sha256"),
                "source_url": receipt.get("url"),
                "fetched_at": receipt.get("fetched_at"),
            }
        )
        for row in rows:
            team_id = str(row.get("team_id") or "").removesuffix(".0")
            group_id = str(row.get("group_id") or "").removesuffix(".0")
            if not team_id or not group_id:
                continue
            key = (int(year), group_id, team_id)
            team = teams.setdefault(
                key,
                {
                    "season": int(year),
                    "group_id": group_id,
                    "group_name": row.get("group_name") or None,
                    "group_short_name": row.get("group_short_name") or None,
                    "team_id": team_id,
                    "team_name": row.get("team_display_name") or row.get("team_name") or team_id,
                    "team_short_name": row.get("team_short_display_name") or None,
                    "team_abbreviation": row.get("team_abbreviation") or None,
                    "stats": {},
                },
            )
            stat_name = row.get("stat_name") or row.get("stat_display_name")
            if stat_name:
                team["stats"][stat_name] = {
                    "label": row.get("stat_display_name") or stat_name,
                    "display": row.get("display_value") or None,
                    "value": _value(row.get("value")),
                }
    records = list(teams.values())
    records.sort(key=lambda row: (row["season"], row["group_name"] or "", row["team_name"] or "", row["team_id"]))
    return {
        "schema_version": 1,
        "generated_at": utcnow(),
        "attribution": {
            **BASKETBALL_ATTRIBUTION,
            "dataset": "espn_mens_college_basketball_standings via SportsDataverse",
            "method": "Source rows compacted by season/group/team; statistic labels and values are retained.",
        },
        "seasons": releases,
        "teams": records,
    }


def write(*, refresh: bool = False, years=YEARS) -> dict:
    release = build(refresh=refresh, years=years)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(release, ensure_ascii=False, separators=(",", ":")) + "\n")
    return release


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    release = write(refresh=args.refresh)
    print(json.dumps({"teams": len(release["teams"]), "seasons": len(release["seasons"])}))
