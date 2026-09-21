"""Build research-only exact-scope WBB D2/D3 ratings from NCAA schedules."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_lower_model import build_division_artifact

DEFAULT_INPUT = ROOT / "frontend/public/data/basketball/womens-lower-division-schedules.json"
DEFAULT_OUTPUT = ROOT / "frontend/public/data/basketball/womens-lower-division-ratings.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    raw = args.input.read_bytes()
    source = json.loads(raw)
    contests = source.get("contests") or []
    receipts = source.get("receipts") or []
    divisions = {}
    for division in (2, 3):
        divisions[f"d{division}"] = build_division_artifact(
            contests,
            division,
            source_receipts=receipts,
            source_asset_sha256=hashlib.sha256(raw).hexdigest(),
            target_schedule_present=False,
        )
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sport": "basketball",
        "gender": "women",
        "target_season": 2027,
        "model_status": "research_only",
        "forecast_status": "not_published",
        "scope": "women's basketball D2 and D3",
        "source_schedule_asset": str(args.input.relative_to(ROOT)),
        "divisions": divisions,
        "limitations": [
            "Ratings are exact-division historical evidence and do not produce 2026-27 predictions.",
            "The next publication step is a receipt-backed NCAA seasonYear=2026 schedule plus another completed season for chronological training and calibration.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {args.output} ({len(contests):,} contests; D2={len(divisions['d2']['ratings']):,} ratings, D3={len(divisions['d3']['ratings']):,} ratings)")


if __name__ == "__main__":
    main()
