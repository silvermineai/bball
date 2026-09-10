"""Fill unavailable NCAA national fields from exact-ID NCAA box releases.

The NCAA final ranking snapshot currently publishes no assists or
assists-per-game rows. When the attributed NCAA player-box release is
available locally, this module derives both measures by exact NCAA player ID
and counted contests only. It never joins by name and never creates a
publisher rank for a supplemented field.
"""

from __future__ import annotations

import copy
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend/public/data/basketball/ncaa-individual.json"
DB = ROOT / ".local/basketball.sqlite3"
RECEIPT = ROOT / ".local/basketball/ncaa_mbb_player_box_2026.parquet.receipt.json"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def box_player_aggregates(conn: sqlite3.Connection, season: int = 2026) -> dict[str, tuple[dict[str, float], int]]:
    """Aggregate exact-ID box totals and distinct source contests per player."""
    totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    contests: dict[str, set[str]] = defaultdict(set)
    for player_id, contest_id, payload in conn.execute(
        "SELECT player_id,contest_id,stats_json FROM bb_ncaa_player_box WHERE season=?",
        (season,),
    ):
        if not player_id or not contest_id:
            continue
        try:
            stats = json.loads(payload)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(stats, dict):
            continue
        pid = str(player_id)
        found = False
        for key, value in stats.items():
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                continue
            if numeric != numeric or numeric in (float("inf"), float("-inf")):
                continue
            totals[pid][key] += numeric
            found = True
        if found:
            contests[pid].add(str(contest_id))
    return {
        player_id: (dict(total), len(contests[player_id]))
        for player_id, total in totals.items()
        if contests[player_id]
    }


def box_assist_totals(conn: sqlite3.Connection, season: int = 2026) -> dict[str, tuple[float, int]]:
    """Return exact-ID assist totals and distinct contest counts."""
    return {
        player_id: (total.get("ast", 0.0), contests)
        for player_id, (total, contests) in box_player_aggregates(conn, season).items()
        if "ast" in total
    }


def box_apg(conn: sqlite3.Connection, season: int = 2026) -> dict[str, tuple[float, int]]:
    """Return exact-ID assists per game and distinct contest counts."""
    return {
        player_id: (total / contests, contests)
        for player_id, (total, contests) in box_assist_totals(conn, season).items()
        if contests
    }


def box_double_doubles(conn: sqlite3.Connection, season: int = 2026) -> dict[str, int]:
    """Count source contests with at least two 10+ statistical categories."""
    contests: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    for player_id, contest_id, payload in conn.execute(
        "SELECT player_id,contest_id,stats_json FROM bb_ncaa_player_box WHERE season=?",
        (season,),
    ):
        if not player_id or not contest_id:
            continue
        try:
            stats = json.loads(payload)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(stats, dict):
            continue
        pid, game = str(player_id), str(contest_id)
        for key in ("pts", "orb", "drb", "ast", "stl", "blk"):
            try:
                value = float(stats[key])
            except (KeyError, TypeError, ValueError):
                continue
            if value == value and value not in (float("inf"), float("-inf")):
                contests[pid][game][key] += value
    result: dict[str, int] = defaultdict(int)
    for player_id, games in contests.items():
        for stats in games.values():
            categories = (
                stats.get("pts", 0.0),
                stats.get("orb", 0.0) + stats.get("drb", 0.0),
                stats.get("ast", 0.0),
                stats.get("stl", 0.0),
                stats.get("blk", 0.0),
            )
            if sum(value >= 10 for value in categories) >= 2:
                result[player_id] += 1
    return dict(result)


DERIVED_FIELDS = (
    "ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct",
    "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "ast", "stl", "blk",
    "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "orb", "drb",
    "pf", "o_poss", "tpm", "tpa", "mins",
)


def derived_values(total: dict[str, float], contests: int) -> dict[str, float]:
    """Map box totals to the national release's rate and total field names."""
    games = float(contests)
    values: dict[str, float] = {}
    direct = {
        "pts": "pts", "ast": "ast", "stl": "stl", "blk": "blk", "tov": "tov",
        "fgm": "fgm", "fga": "fga", "three_fgm": "tpm", "three_fga": "tpa",
        "ftm": "ftm", "fta": "fta", "orb": "orb", "drb": "drb", "pf": "pf",
        "o_poss": "o_poss", "tpm": "tpm", "tpa": "tpa", "mins": "mins",
    }
    for field, source in direct.items():
        if source in total:
            values[field] = total[source]
    if "orb" in total or "drb" in total:
        values["reb"] = total.get("orb", 0.0) + total.get("drb", 0.0)
    if games:
        for field, source in (
            ("ppg", "pts"), ("rpg", "reb"), ("apg", "ast"), ("spg", "stl"),
            ("bpg", "blk"), ("threes_pg", "three_fgm"),
        ):
            if source in values:
                values[field] = values[source] / games
        if "mins" in total:
            values["mpg"] = total["mins"] / games
    if values.get("fga") and "fgm" in values:
        values["fg_pct"] = values["fgm"] / values["fga"] * 100
    if values.get("three_fga") and "three_fgm" in values:
        values["three_pct"] = values["three_fgm"] / values["three_fga"] * 100
    if values.get("fta") and "ftm" in values:
        values["ft_pct"] = values["ftm"] / values["fta"] * 100
    if values.get("tov") and "ast" in values:
        values["ast_to"] = values["ast"] / values["tov"]
    return values


def enrich_release(release: dict, conn: sqlite3.Connection, receipt: dict, season: int = 2026) -> dict:
    if release.get("schema_version") not in (1, 2) or release.get("season") != season:
        raise ValueError("Unsupported NCAA individual release")
    lookup = box_player_aggregates(conn, season)
    double_doubles = box_double_doubles(conn, season)
    result = copy.deepcopy(release)
    previous_supplements = release.get("supplements") if isinstance(release.get("supplements"), dict) else {}
    previous_apg = previous_supplements.get("apg") if isinstance(previous_supplements.get("apg"), dict) else {}
    previous_ast = previous_supplements.get("ast") if isinstance(previous_supplements.get("ast"), dict) else {}
    previous_box = previous_supplements.get("box_derived") if isinstance(previous_supplements.get("box_derived"), dict) else {}
    previous_box_values = previous_box.get("values") if isinstance(previous_box.get("values"), dict) else {}
    supplemented: dict[str, int] = defaultdict(int)
    division_ids: set[str] = set()
    for player in result.get("players", []):
        player_id = str(player.get("player_id", ""))
        value = lookup.get(player_id)
        if value is None:
            continue
        total, contests = value
        derived = derived_values(total, contests)
        if player_id in double_doubles:
            derived["dbl_dbl"] = float(double_doubles[player_id])
        division_ids.add(str(player.get("division")))
        for field in DERIVED_FIELDS:
            if player.get(field) is not None or field not in derived:
                continue
            numeric = derived[field]
            player[field] = round(numeric) if field in {"pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "orb", "drb", "pf", "o_poss", "tpm", "tpa"} else round(numeric, 6)
            supplemented[field] += 1
    coverage = result.setdefault("coverage", {})
    divisions = coverage.setdefault("divisions", {})
    for division in division_ids:
        if division in divisions:
            for field in DERIVED_FIELDS:
                divisions[division][field] = sum(
                    player.get(field) is not None
                    for player in result["players"]
                    if str(player.get("division")) == division
                )
    box_values = {
        field: supplemented[field] or previous_box_values.get(field, 0) or sum(
            player.get(field) is not None and str(player.get("player_id", "")) in lookup
            for player in result.get("players", [])
        )
        for field in DERIVED_FIELDS
    }
    result["supplements"] = {
        "apg": {
            "values": supplemented["apg"] or previous_apg.get("values", 0) or box_values["apg"],
            "season": season,
            "dataset": "ncaa_mbb_player_box",
            "basis": "sum of source assists divided by distinct source contests",
            "source_sha256": receipt.get("sha256"),
            "source_url": receipt.get("url"),
            "publisher_rank": "not supplied; values are descriptive derived rates",
            "generated_at": utcnow(),
        },
        "ast": {
            "values": supplemented["ast"] or previous_ast.get("values", 0) or box_values["ast"],
            "season": season,
            "dataset": "ncaa_mbb_player_box",
            "basis": "sum of source assists across distinct source contests",
            "source_sha256": receipt.get("sha256"),
            "source_url": receipt.get("url"),
            "publisher_rank": "not supplied; values are descriptive derived totals",
            "generated_at": utcnow(),
        },
        "box_derived": {
            "values": box_values,
            "season": season,
            "dataset": "ncaa_mbb_player_box",
            "basis": "exact NCAA player IDs; totals summed across source contests and rates divided by distinct source contests",
            "source_sha256": receipt.get("sha256"),
            "source_url": receipt.get("url"),
            "publisher_rank": "not supplied for derived values; retained publisher values and ranks are never overwritten",
            "generated_at": utcnow(),
        }
    }
    return result


def main() -> None:
    if not PUBLIC.exists() or not DB.exists() or not RECEIPT.exists():
        raise SystemExit("NCAA individual enrichment requires the public release, box database and receipt")
    release = json.loads(PUBLIC.read_text())
    receipt = json.loads(RECEIPT.read_text())
    with sqlite3.connect(DB) as conn:
        enriched = enrich_release(release, conn, receipt)
    PUBLIC.write_text(json.dumps(enriched, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({
        "supplemented_fields": enriched["supplements"]["box_derived"]["values"],
        "source_sha256": receipt.get("sha256"),
    }))


if __name__ == "__main__":
    main()
