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


def main() -> None:
    result = assess(CACHE)
    forecast_path = ROOT / "frontend/public/data/basketball/womens-forecast.json"
    if forecast_path.exists():
        forecast = json.loads(forecast_path.read_text())
        result["baseline_model_id"] = forecast.get("model_id")
        result["baseline_forecast_rows"] = len(forecast.get("forecasts") or [])
        result["model_boundary"] = (
            "A women’s-only baseline forecast is published from validated team-box history. "
            "This readiness board tracks the additional multi-season inputs needed for a richer efficiency fit."
        )
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"WBB forecast readiness: {result['status']} "
        f"({len(result['missing_inputs'])} missing historical assets)"
    )


if __name__ == "__main__":
    main()
