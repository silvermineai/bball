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

# The NCAA release places several stat families under ``other``.  They are
# different source rows with different meanings, so publishing one combined
# "other" leaderboard would add the fields together and produce a misleading
# ranking.  Keep each family separate while retaining the source category in
# the release for auditability.
DERIVED_CATEGORIES = {
    "interceptions": {
        "source_category": "other",
        "label": "Interceptions",
        "primary": "int",
        "primary_label": "Interceptions",
        "metrics": ("int", "intyds", "int_ret_tds"),
        "required": "int",
    },
    "pass_defense": {
        "source_category": "other",
        "label": "Pass defense",
        "primary": "pdef",
        "primary_label": "Passes defended",
        "metrics": ("pdef", "pbu"),
        "required": "pdef",
    },
    "kick_returns": {
        "source_category": "other",
        "label": "Kick returns",
        "primary": "ko_ret_yds",
        "primary_label": "Kick-return yards",
        "metrics": ("ko_ret_yds", "ko_ret", "kick_ret_tds", "long_kor"),
        "required": "ko_ret",
    },
    "scrimmage": {
        "source_category": "other",
        "label": "Scrimmage production",
        "primary": "yds",
        "primary_label": "Scrimmage yards",
        "metrics": ("yds", "plays"),
        "required": "yds",
    },
}

# These fields describe the source envelope rather than a player statistic.
# Everything else that is present and non-empty is retained as an observed
# source field in the coverage manifest.  The NCAA football release does not
# provide a stable athlete identifier; keeping this explicit prevents the
# coverage table from implying an identity join.
IDENTITY_FIELDS = {
    "name",
    "player_name",
    "category",
    "contest_id",
    "team_id",
    "number",
    "position",
    "espn_game_id",
    "season",
    "division",
}


def number(value: object) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result and abs(result) != float("inf") else None


def display_number(value: float) -> int | float:
    return int(value) if value.is_integer() else round(value, 2)


def category_specs(category: str, payload: dict) -> list[tuple[str, dict]]:
    """Return leaderboard families represented by one source row.

    A source row can only enter a derived family when its required field is
    actually present.  This prevents zero-filling absent fields and keeps the
    denominator for rates tied to the source rows for that metric family.
    """
    base = CATEGORIES.get(category)
    if base:
        return [(category, base)]
    if category != "other":
        return []
    return [
        (key, spec)
        for key, spec in DERIVED_CATEGORIES.items()
        if payload.get(spec["required"]) not in (None, "")
    ]


def _division_coverage(
    *,
    player_rows: int,
    rows_with_explicit_division: int,
    source_team_keys: set[str],
    team_keys_reused_across_games: int,
    matching_team_directory_keys: int,
) -> dict:
    """Describe whether this release can support exact division filtering.

    The NCAA-derived football release currently contains contest-scoped team
    keys and no division field.  A team name or a name-only join would make a
    D2/D3 leaderboard look more precise than the retained evidence allows, so
    keep the limitation in the published artifact instead of silently
    classifying rows.
    """
    if player_rows and rows_with_explicit_division == player_rows:
        status = "available"
        reason = "Every retained player row carries an explicit source division."
        supported = ["d1", "d2", "d3"]
    else:
        status = "unavailable"
        supported = []
        reason = (
            "The NCAA-derived player release does not carry a division field "
            "for every player row. Its source team keys are not a stable join "
            "to the retained football team directory, so D1, D2 and D3 rows "
            "cannot be separated without an unverified identity or side join."
        )
    return {
        "status": status,
        "supported_divisions": supported,
        "player_rows": player_rows,
        "rows_with_explicit_division": rows_with_explicit_division,
        "source_team_keys": len(source_team_keys),
        "team_keys_reused_across_games": team_keys_reused_across_games,
        "matching_team_directory_keys": matching_team_directory_keys,
        "reason": reason,
    }


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
    team_directory_ids = set(team_names)

    grouped: dict[tuple[str, str, str], dict] = {}
    category_coverage: dict[str, dict] = {}
    player_rows = 0
    rows_with_explicit_division = 0
    source_team_games: dict[str, set[str]] = defaultdict(set)
    for row in conn.execute(
        "SELECT athlete_id,team_id,game_id,stats_json FROM football_stats "
        "WHERE dataset='ncaa_player_stats' AND season=? ORDER BY record_key",
        (season,),
    ):
        try:
            payload = json.loads(row["stats_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        category = str(payload.get("category") or "").strip()
        if category:
            summary = category_coverage.setdefault(
                category,
                {
                    "rows": 0,
                    "rows_with_source_name": 0,
                    "rows_with_position_or_number": 0,
                    "rows_with_stat_fields": 0,
                    "rows_with_explicit_division": 0,
                    "rows_with_stable_athlete_id": 0,
                    "team_placeholder_rows": 0,
                    "fields": set(),
                },
            )
            summary["rows"] += 1
            name_value = str(payload.get("name") or payload.get("player_name") or "").strip()
            if name_value:
                summary["rows_with_source_name"] += 1
            if payload.get("position") or payload.get("number"):
                summary["rows_with_position_or_number"] += 1
            if str(payload.get("division") or "").strip():
                summary["rows_with_explicit_division"] += 1
            if row["athlete_id"] or payload.get("athlete_id"):
                summary["rows_with_stable_athlete_id"] += 1
            if name_value.upper() in {"TEAM", "TOTAL"}:
                summary["team_placeholder_rows"] += 1
            stat_fields = [
                key for key, value in payload.items()
                if key not in IDENTITY_FIELDS and value not in (None, "")
            ]
            if stat_fields:
                summary["rows_with_stat_fields"] += 1
                summary["fields"].update(stat_fields)
        name = str(payload.get("name") or payload.get("player_name") or "").strip()
        team_id = str(row["team_id"] or payload.get("team_id") or "").strip()
        if team_id:
            game_id = str(row["game_id"] or payload.get("espn_game_id") or payload.get("contest_id") or "").strip()
            if game_id:
                source_team_games[team_id].add(game_id)
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
        specs = category_specs(category, payload)
        if not specs or not name or not team_id or (
            not payload.get("position") and not payload.get("number")
        ):
            continue
        player_rows += 1
        if str(payload.get("division") or "").strip().lower() in {"d1", "d2", "d3", "1", "2", "3", "i", "ii", "iii"}:
            rows_with_explicit_division += 1
        game_id = str(row["game_id"] or payload.get("espn_game_id") or payload.get("contest_id") or "").strip()
        for category_key, spec in specs:
            key = (category_key, name, team_id)
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
            if game_id:
                item["games"].add(game_id)
            if not item["position"] and payload.get("position"):
                item["position"] = str(payload["position"])
            for metric in spec["metrics"]:
                value = number(payload.get(metric))
                if value is not None:
                    item["metrics"][metric] += value

    categories = []
    all_categories = {**CATEGORIES, **DERIVED_CATEGORIES}
    for key, spec in all_categories.items():
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
                    # This is descriptive context derived only from the
                    # retained source rows.  Keep it separate from `rank`,
                    # which remains ordered by the source-category total.
                    "primary_per_game": (
                        display_number(primary / len(item["games"]))
                        if item["games"]
                        else None
                    ),
                    "metrics": metrics,
                }
            )
        rows.sort(key=lambda row: (-float(row["primary"]), -row["games"], row["name"], row["team_id"]))
        # Derived families are only present in the source when their required
        # fields were published.  Do not create empty cards for older seasons
        # that never contained the ``other`` metric family.
        if not rows and spec.get("source_category"):
            continue
        for rank, row in enumerate(rows[:limit], start=1):
            row["rank"] = rank
        category_payload = {
            "key": key,
            "label": spec["label"],
            "primary": spec["primary"],
            "primary_label": spec["primary_label"],
            "rank_basis": "source metric total" if spec.get("source_category") else "source-category total",
            "rate_basis": (
                "source metric total divided by observed game IDs"
                if spec.get("source_category")
                else "source-category total divided by observed game IDs"
            ),
            "leaders": rows[:limit],
        }
        if spec.get("source_category"):
            category_payload["source_category"] = spec["source_category"]
        categories.append(category_payload)

    matching_team_directory_keys = sum(
        1 for team_id in source_team_games if team_id in team_directory_ids
    )
    coverage = _division_coverage(
        player_rows=player_rows,
        rows_with_explicit_division=rows_with_explicit_division,
        source_team_keys=set(source_team_games),
        team_keys_reused_across_games=sum(
            1 for games in source_team_games.values() if len(games) > 1
        ),
        matching_team_directory_keys=matching_team_directory_keys,
    )

    source_category_coverage = []
    for category in sorted(category_coverage):
        summary = category_coverage[category]
        stable_ids = summary["rows_with_stable_athlete_id"]
        source_category_coverage.append(
            {
                "category": category,
                "rows": summary["rows"],
                "rows_with_source_name": summary["rows_with_source_name"],
                "rows_with_position_or_number": summary["rows_with_position_or_number"],
                "rows_with_stat_fields": summary["rows_with_stat_fields"],
                "rows_with_explicit_division": summary["rows_with_explicit_division"],
                "rows_with_stable_athlete_id": stable_ids,
                "team_placeholder_rows": summary["team_placeholder_rows"],
                "fields": sorted(summary["fields"]),
                "identity_status": "source_name_and_team_only" if stable_ids == 0 else "mixed_identity_fields",
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
        "division_coverage": coverage,
        "source_category_coverage": source_category_coverage,
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
        available_seasons = [
            int(row[0])
            for row in conn.execute(
                "SELECT season FROM football_stats WHERE dataset='ncaa_player_stats' "
                "AND season IS NOT NULL AND json_extract(stats_json, '$.category') IN "
                "('passing','rushing','receiving','defense','kicking','punt_returns') "
                "GROUP BY season ORDER BY season"
            )
        ]
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
    release["available_seasons"] = available_seasons
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
