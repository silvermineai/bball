"""Build the honest WBB forecast readiness artifact.

This check reads only retained SportsDataverse release assets and receipts. It
does not download data, fit a model, or fall back to the men's warehouse.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.womens_forecast_readiness import assess  # noqa: E402


CACHE = ROOT / ".local/womens-basketball"
OUT = ROOT / "frontend/public/data/basketball/womens-forecast-readiness.json"
FORECAST = ROOT / "frontend/public/data/basketball/womens-forecast.json"


def main() -> None:
    result = assess(
        CACHE,
        forecast_path=FORECAST,
        target_schedule_path=CACHE / "wbb_schedule_2027.parquet",
    )
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"WBB forecast readiness: {result['status']} "
        f"({len(result['missing_inputs'])} missing historical assets)"
    )


if __name__ == "__main__":
    main()
