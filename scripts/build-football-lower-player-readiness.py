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

    return {
        "schema_version": 1,
        "sport": "football",
        "gender": "men",
        "season": season,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "blocked",
        "source_contracts": endpoint_contracts,
        "divisions": {
            str(diagnostic["requested_scope"]["division"]): {
                "status": diagnostic["status"],
                "candidate_count": len(diagnostic["candidates"]),
                "blockers": sorted(
                    {
                        str(blocker["code"])
                        for candidate in diagnostic["candidates"]
                        for blocker in candidate["blockers"]
                    }
                ),
                "rows_published": 0,
                "reason": (
                    "No football D2/D3 player rows are published from these "
                    "candidate endpoints. The source contract is recorded for "
                    "intake and remains blocked until every row passes the "
                    "explicit-division, identity, and receipt gates."
                ),
            }
            for diagnostic in diagnostics
        },
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
