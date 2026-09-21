#!/usr/bin/env python3
"""Publish the fail-closed football D2/D3 player-source readiness ledger.

This command records public endpoint contracts and local observations.  It
does not fetch a page or classify a player row.  A source becomes publishable
only after the exact response is captured under the robots policy, carries an
explicit division and stable identities, and has a matching receipt.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ncaa_scraper.source_contracts import discover_lower_division_sources

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/public/data/football/lower-division-player-readiness.json"
EVENT_ARCHIVE = ROOT / "frontend/public/data/football/lower-division-player-stats-2026.json"


def build_readiness(season: int = 2026) -> dict:
    diagnostics = [
        discover_lower_division_sources("MFB", division, season=season)
        for division in (2, 3)
    ]
    endpoint_contracts = []
    seen: set[tuple[str, str]] = set()
    for diagnostic in diagnostics:
        for contract in diagnostic["public_endpoint_contracts"]:
            key = (str(contract["key"]), str(contract.get("url") or ""))
            if key in seen:
                continue
            seen.add(key)
            endpoint_contracts.append(contract)

    divisions = {}
    for diagnostic in diagnostics:
        target = str(diagnostic["requested_scope"]["division"])
        target_key = f"d{target}"
        candidates = diagnostic["candidates"]
        box = next(
            (candidate for candidate in candidates if candidate.get("dataset") == "box"),
            {},
        )
        box_observation = box.get("observation") or {}
        team_scope = box_observation.get("team_scope") or {}
        team_rows = team_scope.get("team_rows_by_division") or {}
        mapped_rows = team_scope.get("player_rows_by_division") or {}
        mapped_athletes = team_scope.get("player_athletes_by_division") or {}
        divisions[target] = {
            "status": diagnostic["status"],
            "candidate_count": len(candidates),
            "blockers": sorted(
                {
                    str(blocker["code"])
                    for candidate in candidates
                    for blocker in candidate["blockers"]
                }
            ),
            "rows_published": 0,
            "source_labeled_team_rows": int(team_rows.get(target_key, 0) or 0),
            "box_rows_mapped_to_source_labeled_teams": int(mapped_rows.get(target_key, 0) or 0),
            "unique_athletes_mapped_to_source_labeled_teams": int(mapped_athletes.get(target_key, 0) or 0),
            "reason": (
                "No football D2/D3 player rows are published from these "
                "candidate endpoints. The source contract is recorded for "
                "intake and remains blocked until every row passes the "
                "explicit-division, identity, and receipt gates."
            ),
        }

    event_archive = None
    if EVENT_ARCHIVE.exists():
        try:
            release = json.loads(EVENT_ARCHIVE.read_text(encoding="utf-8"))
            coverage = release.get("coverage") or {}
            event_archive = {
                "status": "partial",
                "asset": EVENT_ARCHIVE.name,
                "publisher": "Public game publisher",
                "season": int(release.get("season") or season),
                "generated_at": release.get("generated_at"),
                "receipt_sha256": (release.get("source") or {}).get("receipt_sha256"),
                "games": int(coverage.get("games") or 0),
                "player_rows": int(coverage.get("player_rows") or 0),
                "players": int(coverage.get("players") or 0),
                "teams": int(coverage.get("teams") or 0),
                "rows_by_division": coverage.get("rows_by_division") or {},
                "players_by_division": coverage.get("players_by_division") or {},
                "classification": "Exact publisher team groups 57 (D2) and 58 (D3); no name or conference joins.",
            }
        except (OSError, ValueError, TypeError):
            event_archive = None

    return {
        "schema_version": 1,
        "sport": "football",
        "gender": "men",
        "season": season,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "blocked",
        "event_archive": event_archive,
        "source_contracts": endpoint_contracts,
        "divisions": divisions,
        "classification_policy": (
            "A group-35 event, school name, conference, non-D1 flag, or missing "
            "division never classifies a player as D2 or D3. Only a source row "
            "with an explicit division and stable player/team IDs can enter the "
            "lower-division player archive."
        ),
        "required_before_import": [
            "robots-permitted exact-season capture",
            "sport=football and gender=men on every row",
            "division=2 or division=3 on every row",
            "season, team_id, team_display_name, athlete_id, and athlete_display_name",
            "source URL, fetched timestamp, and SHA-256 receipt",
            "conflicting duplicate rejection before publication",
        ],
        "limitations": [
            "The retained combined event surface is a Division II/III discovery feed; it is not an exact division label.",
            "The current derived football release documents only its retained top-level capture stages and supplies no D2/D3 player contract.",
            "No lower-division player stats, ranks, or identities are substituted from D1, FBS, FCS, team names, or schedule rows.",
        ],
    }


def main() -> None:
    payload = build_readiness()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(OUT),
        "season": payload["season"],
        "status": payload["status"],
        "endpoint_contracts": len(payload["source_contracts"]),
    }))


if __name__ == "__main__":
    main()
