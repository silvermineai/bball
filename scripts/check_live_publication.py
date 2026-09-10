#!/usr/bin/env python3
"""Check that the deployed publication is live, fresh and structurally usable."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp has no timezone")
    return parsed.astimezone(timezone.utc)


def get_json(base_url: str, path: str, attempts: int = 3) -> dict:
    url = f"{base_url.rstrip('/')}{path}"
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={
                "Accept": "application/json",
                "Cache-Control": "no-cache",
                "User-Agent": "SilverminePublicationMonitor/1.0 (+https://bball.silvermine.dev/)",
            })
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read())
            if not isinstance(payload, dict):
                raise ValueError(f"{path} did not return a JSON object")
            return payload
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    raise RuntimeError(f"could not read {path}: {last_error}")


def receipt_ages(payload: dict, label: str, checked_at: datetime, max_age_hours: float) -> list[float]:
    receipts = payload.get("source_receipts")
    if not isinstance(receipts, list) or not receipts:
        raise ValueError(f"{label} coverage has no source receipts")
    ages = []
    for receipt in receipts:
        name = receipt.get("dataset")
        captured = receipt.get("latest_source_at")
        if not isinstance(name, str) or not isinstance(captured, str):
            raise ValueError(f"{label} source receipt is malformed")
        age = (checked_at - timestamp(captured)).total_seconds() / 3600
        if age < -24 or age > max_age_hours:
            raise ValueError(f"{label} source {name} is {max(age, 0):.1f} hours old")
        ages.append(age)
    return ages


def check_live(base_url: str, *, now: datetime | None = None, max_age_hours: float = 240) -> dict:
    checked_at = now or datetime.now(timezone.utc)
    health = get_json(base_url, "/api/health")
    if health.get("ok") is not True:
        raise ValueError("Worker health response is not ok")

    basketball = get_json(base_url, "/api/basketball/research/coverage?audit=1")
    required = {"coverage", "source_receipts", "location_validation", "possession_validation"}
    if not required.issubset(basketball):
        raise ValueError(f"basketball coverage is missing {sorted(required - set(basketball))}")
    if not isinstance(basketball["coverage"], list) or not basketball["coverage"]:
        raise ValueError("basketball coverage has no dataset rows")
    ages = receipt_ages(basketball, "basketball", checked_at, max_age_hours)

    football = get_json(base_url, "/api/football/coverage")
    if not isinstance(football.get("coverage"), list) or not football["coverage"]:
        raise ValueError("football coverage has no dataset rows")
    football_ages = receipt_ages(football, "football", checked_at, max_age_hours)

    forecasts = get_json(base_url, "/api/basketball/research/forecasts?meta=1")
    models = forecasts.get("models")
    if not isinstance(models, list) or not models:
        raise ValueError("basketball forecast catalog has no model editions")
    latest = models[0]
    if latest.get("target_season") != 2027 or not isinstance(latest.get("forecasts"), int) or latest["forecasts"] <= 0:
        raise ValueError("basketball forecast catalog has no usable 2026–27 edition")
    last_created = latest.get("last_created_at")
    if not isinstance(last_created, str):
        raise ValueError("basketball forecast catalog has no model clock")
    model_age = (checked_at - timestamp(last_created)).total_seconds() / 3600
    if model_age < -24 or model_age > max_age_hours:
        raise ValueError(f"latest basketball model is {max(model_age, 0):.1f} hours old")

    recruiting = get_json(base_url, "/api/basketball/research/recruiting-intake?season=2027")
    if not isinstance(recruiting.get("total"), int) or not isinstance(recruiting.get("providers"), list):
        raise ValueError("recruiting intake coverage is malformed")
    return {
        "base_url": base_url.rstrip("/"),
        "checked_at": checked_at.isoformat().replace("+00:00", "Z"),
        "basketball_datasets": len(basketball["coverage"]),
        "basketball_source_max_age_hours": round(max(ages), 2),
        "football_datasets": len(football["coverage"]),
        "football_source_max_age_hours": round(max(football_ages), 2),
        "forecast_model": latest.get("model_id"),
        "forecast_rows": latest["forecasts"],
        "forecast_age_hours": round(max(model_age, 0), 2),
        "recruiting_rows": recruiting["total"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://bball.silvermine.dev")
    parser.add_argument("--max-age-hours", type=float, default=240)
    args = parser.parse_args()
    try:
        report = check_live(args.base_url, max_age_hours=args.max_age_hours)
    except (RuntimeError, ValueError) as exc:
        raise SystemExit(str(exc)) from None
    print(json.dumps(report, indent=2))
