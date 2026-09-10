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


def market_metadata(payload: dict, sport: str) -> tuple[int, int, int]:
    """Validate market archive metadata without requiring any quotes."""
    if payload.get("sport") != sport:
        raise ValueError(f"{sport} market archive returned the wrong sport")
    total = payload.get("total")
    pregame = payload.get("pregame")
    capabilities = payload.get("provider_capabilities")
    if (
        not isinstance(total, int)
        or not isinstance(pregame, int)
        or total < 0
        or pregame < 0
        or pregame > total
        or not isinstance(capabilities, list)
        or not capabilities
    ):
        raise ValueError(f"{sport} market archive metadata is malformed")
    for capability in capabilities:
        if (
            not isinstance(capability, dict)
            or not isinstance(capability.get("provider"), str)
            or not isinstance(capability.get("markets"), list)
            or not capability["markets"]
            or not isinstance(capability.get("provider_update_clock"), bool)
        ):
            raise ValueError(f"{sport} market provider capability is malformed")
    return total, pregame, len(capabilities)


def player_catalog_metadata(careers: dict, leaders: dict) -> tuple[int, int, int, int]:
    """Validate the player archive and ensure derived assist fields are live."""
    seasons = careers.get("seasons")
    if not isinstance(seasons, list) or not seasons:
        raise ValueError("basketball player archive has no seasons")
    latest = seasons[0]
    if not isinstance(latest, dict) or latest.get("season") != 2026:
        raise ValueError("basketball player archive has no 2025–26 season")
    identified = latest.get("identified_rows")
    entries = latest.get("player_team_entries")
    latest_receipt = careers.get("latest_receipt")
    if (
        not isinstance(identified, int)
        or identified <= 0
        or not isinstance(entries, int)
        or entries <= 0
        or not isinstance(latest_receipt, str)
    ):
        raise ValueError("basketball player archive metadata is malformed")

    if leaders.get("season") != 2026:
        raise ValueError("NCAA leader archive has the wrong season")
    coverage = leaders.get("coverage")
    divisions = coverage.get("divisions") if isinstance(coverage, dict) else None
    if not isinstance(coverage, dict) or not isinstance(coverage.get("players"), int) or coverage["players"] <= 0:
        raise ValueError("NCAA leader archive coverage is malformed")
    if not isinstance(divisions, dict):
        raise ValueError("NCAA leader archive has no division coverage")
    for division in ("1", "2", "3"):
        bucket = divisions.get(division)
        if not isinstance(bucket, dict) or not isinstance(bucket.get("players"), int) or bucket["players"] <= 0:
            raise ValueError(f"NCAA leader archive division {division} is malformed")
    d1_apg = divisions["1"].get("apg")
    if not isinstance(d1_apg, int) or d1_apg <= 0:
        raise ValueError("NCAA leader archive has no Division I assists-per-game values")
    d1_ast = divisions["1"].get("ast")
    if not isinstance(d1_ast, int) or d1_ast <= 0:
        raise ValueError("NCAA leader archive has no Division I total-assist values")
    required_stats = (
        "ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct",
        "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "ast", "stl", "blk",
        "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta",
    )
    if any(not isinstance(divisions["1"].get(stat), int) or divisions["1"][stat] <= 0 for stat in required_stats):
        raise ValueError("NCAA leader archive has incomplete Division I box-derived coverage")
    return identified, entries, d1_apg, d1_ast


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

    football_forecasts = get_json(base_url, "/api/football/research/forecasts?meta=1")
    football_models = football_forecasts.get("models")
    if not isinstance(football_models, list) or not football_models:
        raise ValueError("football forecast catalog has no model editions")
    football_latest = football_models[0]
    if not isinstance(football_latest.get("forecasts"), int) or football_latest["forecasts"] <= 0:
        raise ValueError("football forecast catalog has no usable forecasts")
    football_last_created = football_latest.get("last_created_at")
    if not isinstance(football_last_created, str):
        raise ValueError("football forecast catalog has no model clock")
    football_model_age = (checked_at - timestamp(football_last_created)).total_seconds() / 3600
    if football_model_age < -24 or football_model_age > max_age_hours:
        raise ValueError(f"latest football model is {max(football_model_age, 0):.1f} hours old")

    careers = get_json(base_url, "/api/basketball/research/careers/meta")
    leaders = get_json(base_url, "/api/basketball/research/ncaa-leaders?meta=1")
    player_identified, player_entries, ncaa_d1_apg, ncaa_d1_ast = player_catalog_metadata(careers, leaders)

    recruiting = get_json(base_url, "/api/basketball/research/recruiting-intake?season=2027")
    if not isinstance(recruiting.get("total"), int) or not isinstance(recruiting.get("providers"), list):
        raise ValueError("recruiting intake coverage is malformed")
    recruiting_release = get_json(base_url, "/api/basketball/research/recruiting?season=2027")
    release_coverage = recruiting_release.get("coverage")
    if (
        recruiting_release.get("season") != 2027
        or not isinstance(release_coverage, dict)
        or not isinstance(recruiting_release.get("reviewed_at"), str)
        or any(
            not isinstance(release_coverage.get(key), int)
            for key in ("programs", "players", "events", "sources")
        )
    ):
        raise ValueError("reviewed recruiting release is malformed")
    recruiting_reviewed_age = (
        checked_at - timestamp(recruiting_release["reviewed_at"])
    ).total_seconds() / 3600
    if recruiting_reviewed_age < -24 or recruiting_reviewed_age > max_age_hours:
        raise ValueError(
            f"reviewed recruiting release is {max(recruiting_reviewed_age, 0):.1f} hours old"
        )
    news = get_json(base_url, "/api/basketball/research/news?meta=1")
    news_summary = news.get("summary")
    news_releases = news.get("releases")
    if (
        not isinstance(news_summary, dict)
        or not isinstance(news_summary.get("total"), int)
        or news_summary["total"] <= 0
        or not isinstance(news_summary.get("latest_seen_at"), str)
        or not isinstance(news_releases, list)
        or not news_releases
    ):
        raise ValueError("basketball news archive metadata is malformed")
    news_age = (checked_at - timestamp(news_summary["latest_seen_at"])).total_seconds() / 3600
    if news_age < -24 or news_age > max_age_hours:
        raise ValueError(f"basketball news archive is {max(news_age, 0):.1f} hours old")
    basketball_markets = get_json(base_url, "/api/research/markets?meta=1&sport=basketball")
    basketball_market_total, basketball_market_pregame, basketball_market_capabilities = market_metadata(
        basketball_markets, "basketball"
    )
    football_markets = get_json(base_url, "/api/research/markets?meta=1&sport=football")
    football_market_total, football_market_pregame, football_market_capabilities = market_metadata(
        football_markets, "football"
    )
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
        "football_forecast_model": football_latest.get("model_id"),
        "football_forecast_rows": football_latest["forecasts"],
        "football_forecast_age_hours": round(max(football_model_age, 0), 2),
        "basketball_player_identified_rows": player_identified,
        "basketball_player_team_entries": player_entries,
        "ncaa_d1_apg_values": ncaa_d1_apg,
        "ncaa_d1_ast_values": ncaa_d1_ast,
        # Keep provider intake and reviewed school evidence separate. The
        # former can be zero when no licensed export is configured while the
        # latter remains the public recruiting release.
        "recruiting_rows": recruiting["total"],
        "recruiting_intake_rows": recruiting["total"],
        "recruiting_reviewed_programs": release_coverage["programs"],
        "recruiting_reviewed_players": release_coverage["players"],
        "recruiting_reviewed_events": release_coverage["events"],
        "recruiting_reviewed_sources": release_coverage["sources"],
        "recruiting_reviewed_age_hours": round(max(recruiting_reviewed_age, 0), 2),
        "news_archive_total": news_summary["total"],
        "news_latest_published": news_summary.get("latest_published"),
        "news_latest_seen_age_hours": round(max(news_age, 0), 2),
        "basketball_market_observations": basketball_market_total,
        "basketball_market_pregame": basketball_market_pregame,
        "basketball_market_capabilities": basketball_market_capabilities,
        "football_market_observations": football_market_total,
        "football_market_pregame": football_market_pregame,
        "football_market_capabilities": football_market_capabilities,
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
