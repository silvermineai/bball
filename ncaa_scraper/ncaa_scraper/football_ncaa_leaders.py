"""Build source-native leaderboards from NCAA football player game rows.

The NCAA-derived release has no stable athlete ID. These leaderboards therefore
aggregate only within one season, category, source name and team ID. They are
source triage views, not identity or career rankings.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / ".local/football.sqlite3"
DEFAULT_OUTPUT = ROOT / "frontend/public/data/football/ncaa-player-leaders.json"

CATEGORIES = {
    "passing": {
        "label": "Passing",
        "primary": "pass_yards",
        "primary_label": "Passing yards",
        "metrics": ("pass_yards", "pass_attempts", "completions", "pass_tds", "interceptions"),
    },
    "rushing": {
        "label": "Rushing",
        "primary": "rush_yds_gained",
        "primary_label": "Rushing yards",
        "metrics": ("rush_yds_gained", "rush_attempts", "rush_tds", "rush_long"),
    },
    "receiving": {
        "label": "Receiving",
        "primary": "receiving_yards",
        "primary_label": "Receiving yards",
        "metrics": ("receiving_yards", "rec", "rec_td", "long_rec"),
    },
    "defense": {
        "label": "Defense",
        "primary": "tackles",
        "primary_label": "Tackles",
        "metrics": ("tackles", "solo_tack", "asst_tack", "sacks"),
    },
    "kicking": {
        "label": "Kicking",
        "primary": "fgm",
        "primary_label": "Field goals made",
        "metrics": ("fgm", "fga"),
    },
    "punt_returns": {
        "label": "Punt returns",
        "primary": "punt_ret_yds",
        "primary_label": "Punt-return yards",
        "metrics": ("punt_ret_yds", "punt_ret", "punt_ret_tds", "long_pr"),
    },
}


def number(value: object) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result and abs(result) != float("inf") else None


def display_number(value: float) -> int | float:
    return int(value) if value.is_integer() else round(value, 2)


def build_leaders(
    conn: sqlite3.Connection,
    season: int,
    *,
    limit: int = 25,
    generated_at: str | None = None,
) -> dict:
    conn.row_factory = sqlite3.Row
    team_names: dict[str, str] = {}
    for row in conn.execute(
        "SELECT team_id,stats_json FROM football_stats WHERE dataset='teams'"
    ):
        try:
            payload = json.loads(row["stats_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        name = payload.get("display_name") or payload.get("name") or payload.get("team_name")
        if name and row["team_id"]:
            team_names.setdefault(str(row["team_id"]), str(name))

    grouped: dict[tuple[str, str, str], dict] = {}
    for row in conn.execute(
        "SELECT team_id,game_id,stats_json FROM football_stats "
        "WHERE dataset='ncaa_player_stats' AND season=? ORDER BY record_key",
        (season,),
    ):
        try:
            payload = json.loads(row["stats_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        category = str(payload.get("category") or "").strip()
        spec = CATEGORIES.get(category)
        name = str(payload.get("name") or payload.get("player_name") or "").strip()
        team_id = str(row["team_id"] or payload.get("team_id") or "").strip()
        if (
            name
            and name.upper() not in {"TEAM", "TOTAL"}
            and team_id
            and not payload.get("position")
            and not payload.get("number")
        ):
            # The release also carries one team aggregate row per category.
            # Keep its source label for player display, but never rank that row
            # as an individual.
            team_names.setdefault(team_id, name)
        if not spec or not name or not team_id or (
            not payload.get("position") and not payload.get("number")
        ):
            continue
        key = (category, name, team_id)
        item = grouped.setdefault(
            key,
            {
                "name": name,
                "team_id": team_id,
                "team": team_names.get(team_id, team_id),
                "position": str(payload.get("position") or ""),
                "records": 0,
                "games": set(),
                "metrics": defaultdict(float),
            },
        )
        item["records"] += 1
        game_id = str(row["game_id"] or payload.get("espn_game_id") or payload.get("contest_id") or "").strip()
        if game_id:
            item["games"].add(game_id)
        if not item["position"] and payload.get("position"):
            item["position"] = str(payload["position"])
        for metric in spec["metrics"]:
            value = number(payload.get(metric))
            if value is not None:
                item["metrics"][metric] += value

    categories = []
    for key, spec in CATEGORIES.items():
        rows = []
        for (category, _, _), item in grouped.items():
            if category != key:
                continue
            primary = item["metrics"].get(spec["primary"], 0.0)
            metrics = {
                metric: display_number(item["metrics"][metric])
                for metric in spec["metrics"]
                if metric in item["metrics"]
            }
            rows.append(
                {
                    "name": item["name"],
                    "team": item["team"],
                    "team_id": item["team_id"],
                    "position": item["position"] or None,
                    "records": item["records"],
                    "games": len(item["games"]),
                    "primary": display_number(primary),
                    "metrics": metrics,
                }
            )
        rows.sort(key=lambda row: (-float(row["primary"]), -row["games"], row["name"], row["team_id"]))
        for rank, row in enumerate(rows[:limit], start=1):
            row["rank"] = rank
        categories.append(
            {
                "key": key,
                "label": spec["label"],
                "primary": spec["primary"],
                "primary_label": spec["primary_label"],
                "leaders": rows[:limit],
            }
        )

    return {
        "schema_version": 1,
        "season": season,
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_dataset": "ncaa_player_stats",
        "identity_note": (
            "Aggregated within one season, source name, team ID and category. "
            "The NCAA-derived release does not supply a stable athlete ID; repeated "
            "names are not merged across teams or seasons."
        ),
        "categories": categories,
    }


def write_release(
    database: Path = DEFAULT_DB,
    output: Path = DEFAULT_OUTPUT,
    *,
    season: int = 2025,
    limit: int = 25,
) -> dict:
    conn = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        receipt = conn.execute(
            "SELECT receipt_json FROM football_sources WHERE dataset='ncaa_player_stats' AND season=?",
            (season,),
        ).fetchone()
        if not receipt:
            raise ValueError(f"Missing NCAA player source receipt for {season}")
        receipt_payload = json.loads(receipt[0])
        release = build_leaders(
            conn,
            season,
            limit=limit,
            generated_at=receipt_payload.get("fetched_at"),
        )
    finally:
        conn.close()
    release["source"] = {
        "url": receipt_payload.get("url"),
        "fetched_at": receipt_payload.get("fetched_at"),
        "sha256": receipt_payload.get("sha256"),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(release, ensure_ascii=False, separators=(",", ":")) + "\n")
    return release


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--season", type=int, default=2025)
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    result = write_release(args.database, args.output, season=args.season, limit=args.limit)
    print(json.dumps({
        "season": result["season"],
        "categories": len(result["categories"]),
        "leaders": sum(len(item["leaders"]) for item in result["categories"]),
        "source": result["source"]["url"],
    }))


if __name__ == "__main__":
    main()
