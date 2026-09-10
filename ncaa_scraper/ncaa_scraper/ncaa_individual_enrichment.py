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


def box_assist_totals(conn: sqlite3.Connection, season: int = 2026) -> dict[str, tuple[float, int]]:
    totals: dict[str, float] = defaultdict(float)
    contests: dict[str, set[str]] = defaultdict(set)
    for player_id, contest_id, payload in conn.execute(
        "SELECT player_id,contest_id,stats_json FROM bb_ncaa_player_box WHERE season=?",
        (season,),
    ):
        if not player_id or not contest_id:
            continue
        try:
            stats = json.loads(payload)
            assists = stats.get("ast")
            value = float(assists) if assists is not None else None
        except (TypeError, ValueError, json.JSONDecodeError):
            value = None
        if value is None:
            continue
        totals[str(player_id)] += value
        contests[str(player_id)].add(str(contest_id))
    return {
        player_id: (total, len(contests[player_id]))
        for player_id, total in totals.items()
        if contests[player_id]
    }


def box_apg(conn: sqlite3.Connection, season: int = 2026) -> dict[str, tuple[float, int]]:
    """Return exact-ID assists per game and distinct contest counts."""
    return {
        player_id: (total / contests, contests)
        for player_id, (total, contests) in box_assist_totals(conn, season).items()
        if contests
    }


def enrich_release(release: dict, conn: sqlite3.Connection, receipt: dict, season: int = 2026) -> dict:
    if release.get("schema_version") not in (1, 2) or release.get("season") != season:
        raise ValueError("Unsupported NCAA individual release")
    lookup = box_assist_totals(conn, season)
    result = copy.deepcopy(release)
    previous_supplements = release.get("supplements") if isinstance(release.get("supplements"), dict) else {}
    previous_apg = previous_supplements.get("apg") if isinstance(previous_supplements.get("apg"), dict) else {}
    previous_ast = previous_supplements.get("ast") if isinstance(previous_supplements.get("ast"), dict) else {}
    supplemented_apg = 0
    supplemented_ast = 0
    division_counts: dict[str, int] = defaultdict(int)
    for player in result.get("players", []):
        player_id = str(player.get("player_id", ""))
        value = lookup.get(player_id)
        if value is None:
            continue
        total_assists, contests = value
        if player.get("apg") is None:
            player["apg"] = round(total_assists / contests, 6)
            supplemented_apg += 1
        if player.get("ast") is None:
            player["ast"] = round(total_assists)
            supplemented_ast += 1
        if player.get("apg") is not None:
            division_counts[str(player.get("division"))] += 1
    coverage = result.setdefault("coverage", {})
    divisions = coverage.setdefault("divisions", {})
    for division, count in division_counts.items():
        if division in divisions:
            divisions[division]["apg"] = sum(
                player.get("apg") is not None
                for player in result["players"]
                if str(player.get("division")) == division
            )
            divisions[division]["ast"] = sum(
                player.get("ast") is not None
                for player in result["players"]
                if str(player.get("division")) == division
            )
    derived_apg_values = sum(
        player.get("apg") is not None and str(player.get("player_id", "")) in lookup
        for player in result.get("players", [])
    )
    derived_ast_values = sum(
        player.get("ast") is not None and str(player.get("player_id", "")) in lookup
        for player in result.get("players", [])
    )
    result["supplements"] = {
        "apg": {
            "values": supplemented_apg or previous_apg.get("values", 0) or derived_apg_values,
            "season": season,
            "dataset": "ncaa_mbb_player_box",
            "basis": "sum of source assists divided by distinct source contests",
            "source_sha256": receipt.get("sha256"),
            "source_url": receipt.get("url"),
            "publisher_rank": "not supplied; values are descriptive derived rates",
            "generated_at": utcnow(),
        },
        "ast": {
            "values": supplemented_ast or previous_ast.get("values", 0) or derived_ast_values,
            "season": season,
            "dataset": "ncaa_mbb_player_box",
            "basis": "sum of source assists across distinct source contests",
            "source_sha256": receipt.get("sha256"),
            "source_url": receipt.get("url"),
            "publisher_rank": "not supplied; values are descriptive derived totals",
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
        "supplemented_apg": enriched["supplements"]["apg"]["values"],
        "supplemented_ast": enriched["supplements"]["ast"]["values"],
        "source_sha256": receipt.get("sha256"),
    }))


if __name__ == "__main__":
    main()
