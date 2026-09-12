#!/usr/bin/env python3
"""Check that the deployed publication is live, fresh and structurally usable."""

from __future__ import annotations

import argparse
import json
import re
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


def schedule_clock_metadata(payload: dict) -> tuple[int, int]:
    """Validate the exact-ID ESPN schedule-clock observation catalog."""
    total = payload.get("total")
    confirmed = payload.get("confirmed")
    if (
        payload.get("season") != 2027
        or payload.get("provider") != "ESPN Scoreboard"
        or not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(confirmed, int)
        or isinstance(confirmed, bool)
        or confirmed < 0
        or confirmed > total
    ):
        raise ValueError("basketball schedule-clock metadata is malformed")
    return total, confirmed


def brief_archive_metadata(payload: dict) -> tuple[int, int]:
    """Validate the durable reading archive without downloading snapshots."""
    total = payload.get("total")
    rows = payload.get("rows")
    if not isinstance(total, int) or total <= 0 or not isinstance(rows, list) or not rows:
        raise ValueError("brief archive metadata is malformed")
    for row in rows:
        if (
            not isinstance(row, dict)
            or row.get("sport") not in {"basketball", "football"}
            or not isinstance(row.get("game_id"), str)
            or not isinstance(row.get("revision"), str)
            or len(row["revision"]) != 64
        ):
            raise ValueError("brief archive row is malformed")
    return total, len(rows)


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
        "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "orb", "drb",
        "pf", "o_poss", "tpm", "tpa", "mins",
    )
    if any(not isinstance(divisions["1"].get(stat), int) or divisions["1"][stat] <= 0 for stat in required_stats):
        raise ValueError("NCAA leader archive has incomplete Division I box-derived coverage")
    return identified, entries, d1_apg, d1_ast


def player_box_field_metadata(payload: dict) -> tuple[int, int, int]:
    """Validate the field-level NCAA box archive completeness artifact."""
    fields = payload.get("fields")
    seasons = payload.get("seasons")
    if not isinstance(fields, list) or not fields or any(
        not isinstance(field, str) or not field.strip() for field in fields
    ):
        raise ValueError("NCAA player box field coverage is malformed")
    if len(set(fields)) != len(fields):
        raise ValueError("NCAA player box field coverage has duplicate fields")
    if not isinstance(seasons, list) or not seasons:
        raise ValueError("NCAA player box field coverage has no seasons")
    latest = max(
        (row for row in seasons if isinstance(row, dict)),
        key=lambda row: int(row.get("season", 0) or 0),
        default=None,
    )
    if not latest or int(latest.get("season", 0) or 0) != 2026:
        raise ValueError("NCAA player box field coverage has no 2025–26 season")
    rows = latest.get("rows")
    coverage = latest.get("fields")
    if not isinstance(rows, int) or rows <= 0 or not isinstance(coverage, dict):
        raise ValueError("NCAA player box field coverage is malformed")
    for field in fields:
        item = coverage.get(field)
        if not isinstance(item, dict):
            raise ValueError("NCAA player box field coverage is incomplete")
        observed = item.get("observed")
        share = item.get("share")
        if (
            not isinstance(observed, int)
            or isinstance(observed, bool)
            or observed < 0
            or observed > rows
            or not isinstance(share, (int, float))
            or isinstance(share, bool)
            or not 0 <= share <= 1
        ):
            raise ValueError("NCAA player box field coverage is malformed")
    required = {"pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"}
    if any(
        field not in coverage or not isinstance(coverage[field].get("observed"), int)
        or coverage[field]["observed"] <= 0
        for field in required
    ):
        raise ValueError("NCAA player box field coverage is missing core stats")
    return len(fields), rows, sum(
        1 for item in coverage.values()
        if isinstance(item, dict) and isinstance(item.get("observed"), int) and item["observed"] > 0
    )


def validate_reviewed_recruiting_release(
    payload: dict,
    checked_at: datetime,
    max_age_hours: float,
) -> tuple[dict, float]:
    """Validate that the reviewed recruiting edition is present and non-empty."""
    release_coverage = payload.get("coverage")
    required_counts = ("programs", "players", "events", "sources")
    sources = payload.get("sources")
    if (
        payload.get("season") != 2027
        or not isinstance(release_coverage, dict)
        or not isinstance(payload.get("reviewed_at"), str)
        or not isinstance(sources, list)
        or len(sources) != release_coverage.get("sources")
        or any(
            not isinstance(source, dict)
            or not isinstance(source.get("source_sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", source["source_sha256"])
            for source in sources
        )
        or any(
            not isinstance(release_coverage.get(key), int)
            or release_coverage[key] <= 0
            for key in required_counts
        )
    ):
        raise ValueError("reviewed recruiting release is malformed or empty")
    age = (checked_at - timestamp(payload["reviewed_at"])).total_seconds() / 3600
    if age < -24 or age > max_age_hours:
        raise ValueError(f"reviewed recruiting release is {max(age, 0):.1f} hours old")
    return release_coverage, age


def validate_recruiting_destinations(destinations: object) -> None:
    """Validate the destination summary and its position-mix accounting.

    Destination cards are derived from the same filtered ESPN release as the
    prospect rows. A broken join or a truncated position query must fail the
    publication check instead of making a partial class look authoritative.
    A source row can carry a team name without an ID, so ``team_id`` remains
    nullable; when present it must be a numeric source ID suitable for the
    program dossier link.
    """
    if not isinstance(destinations, list) or len(destinations) > 12:
        raise ValueError("ESPN recruiting destination summary is malformed")
    for destination in destinations:
        if not isinstance(destination, dict):
            raise ValueError("ESPN recruiting destination summary is malformed")
        team = destination.get("team")
        total = destination.get("total")
        team_id = destination.get("team_id")
        if (
            not isinstance(team, str)
            or not team.strip()
            or not isinstance(total, int)
            or isinstance(total, bool)
            or total <= 0
            or (
                team_id is not None
                and (
                    not isinstance(team_id, str)
                    or not re.fullmatch(r"\d{1,15}", team_id.strip())
                )
            )
        ):
            raise ValueError("ESPN recruiting destination summary is malformed")
        for key in ("ranked_total", "top100_total"):
            value = destination.get(key)
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or value < 0
                or value > total
            ):
                raise ValueError("ESPN recruiting destination summary is malformed")
        best_rank = destination.get("best_rank")
        average_rank = destination.get("average_rank")
        if best_rank is not None and (
            not isinstance(best_rank, int)
            or isinstance(best_rank, bool)
            or best_rank <= 0
        ):
            raise ValueError("ESPN recruiting destination summary is malformed")
        if average_rank is not None and (
            not isinstance(average_rank, (int, float))
            or isinstance(average_rank, bool)
            or not (0 < average_rank)
        ):
            raise ValueError("ESPN recruiting destination summary is malformed")
        mix = destination.get("position_breakdown")
        if not isinstance(mix, list):
            raise ValueError("ESPN recruiting destination position mix is malformed")
        if team_id is not None and not mix:
            raise ValueError("ESPN recruiting destination position mix is malformed")
        seen: set[str] = set()
        mix_total = 0
        for item in mix:
            if not isinstance(item, dict):
                raise ValueError("ESPN recruiting destination position mix is malformed")
            position = item.get("position")
            count = item.get("total")
            if (
                not isinstance(position, str)
                or not position.strip()
                or position in seen
                or not isinstance(count, int)
                or isinstance(count, bool)
                or count <= 0
            ):
                raise ValueError("ESPN recruiting destination position mix is malformed")
            seen.add(position)
            mix_total += count
        if mix_total != total:
            raise ValueError("ESPN recruiting destination position mix does not reconcile")


def validate_recruiting_rank_quality(quality: object, total: object) -> tuple[int, int]:
    """Validate the source board's tied-rank audit without rewriting ranks."""
    if not isinstance(quality, dict) or not isinstance(total, int) or isinstance(total, bool) or total < 0:
        raise ValueError("ESPN recruiting rank-quality audit is malformed")
    ranked_rows = quality.get("ranked_rows")
    tied_rank_values = quality.get("tied_rank_values")
    tied_rows = quality.get("tied_rows")
    values = (ranked_rows, tied_rank_values, tied_rows)
    if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in values):
        raise ValueError("ESPN recruiting rank-quality audit is malformed")
    if ranked_rows > total or tied_rank_values > ranked_rows or (tied_rank_values == 0 and tied_rows != 0) or tied_rows < tied_rank_values * 2 or tied_rows > ranked_rows:
        raise ValueError("ESPN recruiting rank-quality audit is inconsistent")
    return tied_rank_values, tied_rows


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

    # Personnel is a separate high-volume football archive. Keep its source
    # receipts in the monitor so a successful forecast refresh cannot publish
    # a stale or empty roster/recruiting desk unnoticed.
    football_recruiting = get_json(base_url, "/api/football/recruiting?meta=1")
    personnel_seasons = football_recruiting.get("seasons")
    personnel_datasets = football_recruiting.get("datasets")
    personnel_receipts = football_recruiting.get("receipts")
    if (
        not isinstance(personnel_seasons, list)
        or 2026 not in personnel_seasons
        or not isinstance(personnel_datasets, list)
        or not isinstance(personnel_receipts, list)
    ):
        raise ValueError("football recruiting catalog is malformed")
    current_personnel = {
        str(row.get("dataset")): row.get("rows")
        for row in personnel_datasets
        if isinstance(row, dict) and row.get("season") == 2026
    }
    required_personnel = {"rosters", "recruits", "team_talent", "returning_production"}
    if (
        set(current_personnel) != required_personnel
        or any(not isinstance(current_personnel[name], int) or current_personnel[name] <= 0 for name in required_personnel)
    ):
        raise ValueError("football recruiting catalog has incomplete current-season coverage")
    personnel_ages = []
    for receipt in personnel_receipts:
        if not isinstance(receipt, dict) or receipt.get("season") != 2026:
            continue
        captured = receipt.get("fetched_at")
        if not isinstance(captured, str):
            raise ValueError("football recruiting source receipt is malformed")
        age = (checked_at - timestamp(captured)).total_seconds() / 3600
        if age < -24 or age > max_age_hours:
            raise ValueError(f"football recruiting source is {max(age, 0):.1f} hours old")
        personnel_ages.append(age)
    if len(personnel_ages) != len(required_personnel):
        raise ValueError("football recruiting catalog has incomplete source receipts")

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
    scorecard = get_json(
        base_url,
        "/api/research/scorecard?sport=basketball&season=2027&status=excluded&limit=1&publication_check=1",
    )
    scorecard_rows = scorecard.get("games")
    if not isinstance(scorecard_rows, list):
        raise ValueError("basketball scorecard response has no game rows")
    if scorecard.get("total", 0) > 0:
        visible_model = scorecard_rows[0].get("model_id") if scorecard_rows else None
        if visible_model != latest.get("model_id"):
            raise ValueError("basketball scorecard is showing an outdated excluded model")

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

    schedule_clock = get_json(
        base_url,
        "/api/basketball/research/schedule-times?season=2027&meta=1&publication_check=1",
    )
    schedule_clock_total, schedule_clock_confirmed = schedule_clock_metadata(schedule_clock)

    careers = get_json(base_url, "/api/basketball/research/careers/meta")
    leaders = get_json(base_url, "/api/basketball/research/ncaa-leaders?meta=1")
    player_identified, player_entries, ncaa_d1_apg, ncaa_d1_ast = player_catalog_metadata(careers, leaders)
    player_box_fields = get_json(base_url, "/data/basketball/ncaa-player-box-fields.json")
    ncaa_box_field_count, ncaa_box_latest_rows, ncaa_box_observed_fields = player_box_field_metadata(player_box_fields)

    recruiting = get_json(base_url, "/api/basketball/research/recruiting-intake?season=2027")
    if not isinstance(recruiting.get("total"), int) or not isinstance(recruiting.get("providers"), list):
        raise ValueError("recruiting intake coverage is malformed")
    # Use a distinct cache key so a post-sync monitor never validates an older
    # edge-cached recruiting edition.
    recruiting_release = get_json(base_url, "/api/basketball/research/recruiting?season=2027&publication_check=1")
    release_coverage, recruiting_reviewed_age = validate_reviewed_recruiting_release(
        recruiting_release, checked_at, max_age_hours
    )
    prospect_counts = {}
    prospect_destination_counts = {}
    prospect_rank_ties = {}
    prospect_ages = {}
    for prospect_season in (2026, 2027, 2028, 2029, 2030):
        recruiting_rankings = get_json(
            base_url,
            f"/api/basketball/research/recruiting-rankings?season={prospect_season}&page=0&publication_check=1",
        )
        prospect_total = recruiting_rankings.get("total")
        prospect_rows = recruiting_rankings.get("rows")
        commitment_destinations = recruiting_rankings.get("commitment_destinations")
        rank_quality = recruiting_rankings.get("rank_quality")
        prospect_captured = recruiting_rankings.get("captured_at")
        prospect_source = recruiting_rankings.get("source")
        validate_recruiting_destinations(commitment_destinations)
        tied_rank_values, tied_rows = validate_recruiting_rank_quality(rank_quality, prospect_total)
        if (
            recruiting_rankings.get("season") != prospect_season
            or not isinstance(prospect_total, int)
            or prospect_total <= 0
            or not isinstance(prospect_rows, list)
            or not prospect_rows
            or not isinstance(prospect_captured, str)
            or not isinstance(prospect_source, dict)
            or prospect_source.get("provider") != "ESPN Recruiting"
        ):
            raise ValueError(f"ESPN recruiting rankings release {prospect_season} is malformed or empty")
        prospect_age = (checked_at - timestamp(prospect_captured)).total_seconds() / 3600
        if prospect_age < -24 or prospect_age > max_age_hours:
            raise ValueError(f"ESPN recruiting rankings release {prospect_season} is {max(prospect_age, 0):.1f} hours old")
        prospect_counts[str(prospect_season)] = prospect_total
        prospect_destination_counts[str(prospect_season)] = len(commitment_destinations)
        prospect_rank_ties[str(prospect_season)] = {"tied_rank_values": tied_rank_values, "tied_rows": tied_rows}
        prospect_ages[str(prospect_season)] = round(max(prospect_age, 0), 2)
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
    brief_archive = get_json(base_url, "/api/research/briefs?sport=all&page=0")
    brief_archive_total, brief_archive_page = brief_archive_metadata(brief_archive)
    return {
        "base_url": base_url.rstrip("/"),
        "checked_at": checked_at.isoformat().replace("+00:00", "Z"),
        "basketball_datasets": len(basketball["coverage"]),
        "basketball_source_max_age_hours": round(max(ages), 2),
        "football_datasets": len(football["coverage"]),
        "football_source_max_age_hours": round(max(football_ages), 2),
        "football_personnel_rows": sum(current_personnel.values()),
        "football_personnel_source_max_age_hours": round(max(personnel_ages), 2),
        "forecast_model": latest.get("model_id"),
        "forecast_rows": latest["forecasts"],
        "forecast_age_hours": round(max(model_age, 0), 2),
        "scorecard_excluded_rows": scorecard.get("total", 0),
        "football_forecast_model": football_latest.get("model_id"),
        "football_forecast_rows": football_latest["forecasts"],
        "football_forecast_age_hours": round(max(football_model_age, 0), 2),
        "schedule_clock_observed_games": schedule_clock_total,
        "schedule_clock_confirmed_games": schedule_clock_confirmed,
        "basketball_player_identified_rows": player_identified,
        "basketball_player_team_entries": player_entries,
        "ncaa_d1_apg_values": ncaa_d1_apg,
        "ncaa_d1_ast_values": ncaa_d1_ast,
        "ncaa_box_field_count": ncaa_box_field_count,
        "ncaa_box_latest_rows": ncaa_box_latest_rows,
        "ncaa_box_observed_fields": ncaa_box_observed_fields,
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
        "recruiting_prospect_rows": prospect_counts,
        "recruiting_prospect_destination_groups": prospect_destination_counts,
        "recruiting_prospect_rank_ties": prospect_rank_ties,
        "recruiting_prospect_age_hours": prospect_ages,
        "news_archive_total": news_summary["total"],
        "news_latest_published": news_summary.get("latest_published"),
        "news_latest_seen_age_hours": round(max(news_age, 0), 2),
        "basketball_market_observations": basketball_market_total,
        "basketball_market_pregame": basketball_market_pregame,
        "basketball_market_capabilities": basketball_market_capabilities,
        "football_market_observations": football_market_total,
        "football_market_pregame": football_market_pregame,
        "football_market_capabilities": football_market_capabilities,
        "brief_archive_total": brief_archive_total,
        "brief_archive_page_rows": brief_archive_page,
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
