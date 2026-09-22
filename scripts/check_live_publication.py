#!/usr/bin/env python3
"""Check that the deployed publication is live, fresh and structurally usable."""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from math import isfinite
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


# The source refresh is scheduled every day. Allow for delayed GitHub-hosted
# runners and the bounded four-hour publisher job, but fail before a second
# daily refresh can be missed without an alert.
DAILY_PUBLICATION_MAX_AGE_HOURS = 36


def timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp has no timezone")
    return parsed.astimezone(timezone.utc)


def get_json(base_url: str, path: str, attempts: int = 4) -> dict:
    # Cloudflare can cache the bounded static fallback for the audit endpoint
    # after a transient D1 timeout. A probe key forces the monitor to observe
    # the live receipt catalog instead of validating that stale fallback.
    # The publication monitor adds a distinct publication_check key to the
    # audit URL. Treat that form the same as the bare audit path: without a
    # fresh probe, an edge can hand back a cached partial D1 validation result
    # even though the next uncached scan is complete.
    if path.startswith("/api/basketball/research/coverage?audit=1") and "probe=" not in path:
        path = f"{path}&probe={time.time_ns()}"
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
        # ``urllib`` can surface a read timeout as ``socket.timeout`` (an
        # OSError) rather than the built-in TimeoutError, depending on the
        # Python runtime. Treat both forms as transient so a slow D1 read is
        # retried instead of aborting the entire publication audit.
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                delay = float(2**attempt)
                if isinstance(exc, HTTPError):
                    retry_after = exc.headers.get("Retry-After")
                    try:
                        # Cloudflare's bounded D1 fallback publishes a
                        # Retry-After clock; honoring it avoids declaring a
                        # transient warehouse read a failed release.
                        delay = min(max(float(retry_after), 0.0), 30.0)
                    except (TypeError, ValueError):
                        pass
                time.sleep(delay)
    raise RuntimeError(f"could not read {path}: {last_error}")


def receipt_ages(
    payload: dict,
    label: str,
    checked_at: datetime,
    max_age_hours: float,
    *,
    archival_datasets: set[str] | None = None,
) -> list[float]:
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
        archival = name in (archival_datasets or set())
        if age < -24 or (age > max_age_hours and not archival):
            raise ValueError(f"{label} source {name} is {max(age, 0):.1f} hours old")
        # Final-season snapshots remain valid after the daily feeds refresh.
        # Keep their real capture clock visible without letting a historical
        # edition redefine the freshness of active schedules and box scores.
        if not archival:
            ages.append(age)
    return ages


def validate_coverage_audit(payload: dict) -> tuple[dict, dict]:
    """Require the deployed deep audit to finish instead of accepting partial evidence."""
    status = payload.get("audit_status")
    location = payload.get("location_validation")
    possession = payload.get("possession_validation")
    if status != "complete":
        raise ValueError(f"basketball coverage audit is {status or 'missing'}")
    if not isinstance(location, dict) or not isinstance(possession, dict):
        raise ValueError("basketball coverage audit has incomplete validation results")
    return location, possession


def validate_market_capture(payload: dict, sport: str) -> str | None:
    """Validate the latest capture outcome without turning it into a quote.

    A receipt only proves that a capture ran.  The latest capture must also
    explain whether it found no eligible summaries, found summaries without
    quotes, rejected published quotes, or retained validated quotes.  Keeping
    these states explicit prevents an incomplete connector response from
    looking like a healthy but empty market archive.
    """
    capture = payload.get("research_capture")
    if capture is None:
        if payload.get("research_receipts", 0) > 0:
            raise ValueError(f"{sport} market archive has receipts but no latest capture status")
        return None
    if not isinstance(capture, dict):
        raise ValueError(f"{sport} market capture metadata is malformed")
    status = capture.get("market_status")
    allowed = {"no_eligible_summaries", "no_quotes_published", "quotes_failed_validation", "capture_incomplete", "capture_blocked_policy", "validated_quotes"}
    if status not in allowed:
        raise ValueError(f"{sport} market capture has an unresolved status")
    captured_at = capture.get("captured_at")
    if not isinstance(captured_at, str):
        raise ValueError(f"{sport} market capture has no capture clock")
    try:
        timestamp(captured_at)
    except (TypeError, ValueError):
        raise ValueError(f"{sport} market capture has an invalid capture clock") from None

    def nonnegative_int(key: str) -> int | None:
        value = capture.get(key)
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{sport} market capture field {key} is malformed")
        return value

    summary_count = nonnegative_int("summary_count")
    source_rows = nonnegative_int("source_rows")
    priced_rows = nonnegative_int("summary_with_pickcenter")
    if priced_rows is None:
        priced_rows = nonnegative_int("rows_with_lines")
    summary_with_odds = nonnegative_int("summary_with_odds")
    eligible_games = nonnegative_int("eligible_games")
    fetch_failures = nonnegative_int("summary_fetch_failures") or 0
    accepted = nonnegative_int("accepted_markets") or 0
    rejected = nonnegative_int("rejected_records") or 0
    blocked_reason = capture.get("capture_blocked_reason")
    source_count = summary_count if summary_count is not None else source_rows
    if source_count is None:
        raise ValueError(f"{sport} market capture has no inspected-summary count")
    if priced_rows is not None and summary_count is not None and priced_rows > summary_count:
        raise ValueError(f"{sport} market capture has more quote summaries than inspected summaries")
    if summary_with_odds is not None and summary_count is not None and summary_with_odds > summary_count:
        raise ValueError(f"{sport} market capture has more odds summaries than inspected summaries")
    if eligible_games is not None:
        if source_count is not None and source_count > eligible_games:
            raise ValueError(f"{sport} market capture inspected more summaries than eligible games")
        if fetch_failures > eligible_games:
            raise ValueError(f"{sport} market capture has more fetch failures than eligible games")
        if source_count is not None and source_count + fetch_failures > eligible_games:
            raise ValueError(f"{sport} market capture counts exceed eligible games")
    if status == "no_eligible_summaries":
        if source_count != 0 or eligible_games not in (None, 0) or accepted or rejected:
            raise ValueError(f"{sport} market capture no-eligible status does not reconcile")
    elif status == "capture_blocked_policy":
        if blocked_reason != "robots_policy_unverified" or source_count != 0 or (priced_rows or 0) != 0 or accepted or rejected or fetch_failures:
            raise ValueError(f"{sport} market capture policy-blocked status does not reconcile")
    elif status == "no_quotes_published":
        if source_count <= 0 or (priced_rows or 0) != 0 or accepted or rejected:
            raise ValueError(f"{sport} market capture no-quote status does not reconcile")
    elif status == "quotes_failed_validation":
        if source_count <= 0 or (priced_rows or 0) <= 0 or accepted or rejected <= 0:
            raise ValueError(f"{sport} market capture rejected status does not reconcile")
    elif status == "capture_incomplete":
        # A partial capture can retain valid quotes from the responses that
        # succeeded. Those rows remain historical evidence, but the public
        # readiness state must stay incomplete until every eligible summary
        # has a bounded outcome. Do not require accepted/rejected counters to
        # be zero here; the worker classifies mixed outcomes conservatively.
        if eligible_games is None or eligible_games <= 0 or fetch_failures <= 0:
            raise ValueError(f"{sport} market capture incomplete status does not reconcile")
    elif accepted <= 0:
        raise ValueError(f"{sport} market capture validated status has no accepted markets")
    return status


def market_metadata(payload: dict, sport: str) -> tuple[int, int, int, int]:
    """Validate market archive metadata without requiring any quotes."""
    if payload.get("sport") != sport:
        raise ValueError(f"{sport} market archive returned the wrong sport")
    total = payload.get("total")
    pregame = payload.get("pregame")
    capabilities = payload.get("provider_capabilities")
    receipts = payload.get("archive_receipts")
    research_receipts = payload.get("research_receipts", 0)
    if (
        not isinstance(total, int)
        or not isinstance(pregame, int)
        or total < 0
        or pregame < 0
        or pregame > total
        or not isinstance(capabilities, list)
        or not capabilities
        or not isinstance(receipts, list)
        or not isinstance(research_receipts, int)
        or research_receipts < 0
    ):
        raise ValueError(f"{sport} market archive metadata is malformed")
    validate_market_capture(payload, sport)
    for capability in capabilities:
        if (
            not isinstance(capability, dict)
            or not isinstance(capability.get("markets"), list)
            or not capability["markets"]
            or not isinstance(capability.get("provider_update_clock"), bool)
        ):
            raise ValueError(f"{sport} market provider capability is malformed")
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("dataset"), str)
            or not isinstance(receipt.get("season"), int)
            or not isinstance(receipt.get("fetched_at"), str)
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
        ):
            raise ValueError(f"{sport} market archive receipt is malformed")
    if sport == "football" and not receipts:
        raise ValueError("football market archive has no source receipts")
    return total, pregame, len(capabilities), len(receipts) + research_receipts


def football_personnel_readiness_metadata(
    payload: dict,
    checked_at: datetime,
    max_age_hours: float,
    expected_season: int = 2026,
    expected_model_id: str | None = None,
) -> tuple[dict, float]:
    """Validate the exact-ID personnel context published for football games.

    This file is research context rather than a forecast input. It still needs
    the same publication guarantees as a model artifact: every row must have
    one exact game identity, coverage totals must reconcile, and both source
    receipts must be fresh and cryptographically identified.
    """
    if payload.get("version") != "football-personnel-readiness-v1":
        raise ValueError("football personnel readiness has an unknown version")
    if payload.get("target_season") != expected_season:
        raise ValueError("football personnel readiness has the wrong target season")
    primary_model_id = payload.get("primary_model_id")
    if not isinstance(primary_model_id, str) or not primary_model_id.strip():
        raise ValueError("football personnel readiness has no primary model identity")
    if expected_model_id is not None and primary_model_id != expected_model_id:
        raise ValueError("football personnel readiness model identity does not match the forecast edition")
    generated_at = payload.get("generated_at")
    if not isinstance(generated_at, str):
        raise ValueError("football personnel readiness has no generation clock")
    generated_age = (checked_at - timestamp(generated_at)).total_seconds() / 3600
    if generated_age < -24 or generated_age > max_age_hours:
        raise ValueError(f"football personnel readiness is {max(generated_age, 0):.1f} hours old")

    coverage = payload.get("coverage")
    if not isinstance(coverage, dict):
        raise ValueError("football personnel readiness has no coverage object")
    count_keys = ("forecast_games", "team_sides", "complete_games", "partial_games", "conflict_games", "unavailable_games", "personnel_teams")
    counts = {key: coverage.get(key) for key in count_keys}
    if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in counts.values()):
        raise ValueError("football personnel readiness coverage counts are malformed")
    forecast_games = counts["forecast_games"]
    if forecast_games <= 0 or counts["team_sides"] != forecast_games * 2:
        raise ValueError("football personnel readiness team-side coverage does not reconcile")
    if sum(counts[key] for key in ("complete_games", "partial_games", "conflict_games", "unavailable_games")) != forecast_games:
        raise ValueError("football personnel readiness status counts do not reconcile")
    fields = payload.get("feature_fields")
    expected_fields = {"talent_composite", "talent_rank", "blue_chip_ratio", "off_returning", "def_returning", "overall_returning"}
    if not isinstance(fields, list) or set(fields) != expected_fields:
        raise ValueError("football personnel readiness feature fields are malformed")
    field_counts = coverage.get("field_side_counts")
    if not isinstance(field_counts, dict) or any(
        field not in field_counts or not isinstance(field_counts[field], int) or isinstance(field_counts[field], bool)
        or field_counts[field] < 0 or field_counts[field] > counts["team_sides"]
        for field in expected_fields
    ):
        raise ValueError("football personnel readiness field coverage is malformed")

    receipts = payload.get("source_receipts")
    if not isinstance(receipts, list) or {receipt.get("dataset") for receipt in receipts if isinstance(receipt, dict)} != {"team_talent", "returning_production"}:
        raise ValueError("football personnel readiness receipts are incomplete")
    receipt_ages = []
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("dataset"), str)
            or not isinstance(receipt.get("season"), int)
            or receipt["season"] != expected_season
            or not isinstance(receipt.get("fetched_at"), str)
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
        ):
            raise ValueError("football personnel readiness receipt is malformed")
        age = (checked_at - timestamp(receipt["fetched_at"])).total_seconds() / 3600
        if age < -24 or age > max_age_hours:
            raise ValueError(f"football personnel readiness source is {max(age, 0):.1f} hours old")
        receipt_ages.append(age)

    games = payload.get("games")
    if not isinstance(games, list) or len(games) != forecast_games:
        raise ValueError("football personnel readiness game rows do not reconcile")
    statuses = {"complete": 0, "partial": 0, "conflict": 0, "unavailable": 0}
    game_ids = set()
    for game in games:
        if not isinstance(game, dict):
            raise ValueError("football personnel readiness game row is malformed")
        game_id = game.get("game_id")
        if not isinstance(game_id, str) or not game_id or game_id in game_ids:
            raise ValueError("football personnel readiness game identity is not unique")
        game_ids.add(game_id)
        status = game.get("status")
        if status not in statuses:
            raise ValueError("football personnel readiness game status is malformed")
        statuses[status] += 1
        for side in ("home", "away"):
            context = game.get(side)
            if not isinstance(context, dict) or not isinstance(context.get("team_id"), str) or not context["team_id"]:
                raise ValueError("football personnel readiness team identity is malformed")
            available = context.get("available_fields")
            conflicts = context.get("conflicting_fields")
            datasets = context.get("source_datasets")
            if not isinstance(available, list) or not set(available).issubset(expected_fields) or len(set(available)) != len(available):
                raise ValueError("football personnel readiness available fields are malformed")
            if not isinstance(conflicts, list) or not set(conflicts).issubset(expected_fields):
                raise ValueError("football personnel readiness conflict fields are malformed")
            if not isinstance(datasets, list) or not set(datasets).issubset({"team_talent", "returning_production"}):
                raise ValueError("football personnel readiness source datasets are malformed")
    for status, count in statuses.items():
        if count != counts[f"{status}_games"]:
            raise ValueError("football personnel readiness game status rows do not reconcile")
    return coverage, max(max(receipt_ages), generated_age, 0)


def schedule_clock_metadata(payload: dict, checked_at: datetime, max_age_hours: float) -> tuple[int, int, float | None]:
    """Validate the exact-ID ESPN schedule-clock observation catalog."""
    total = payload.get("total")
    confirmed = payload.get("confirmed")
    latest = payload.get("latest_observed_at")
    if (
        payload.get("season") != 2027
        or not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(confirmed, int)
        or isinstance(confirmed, bool)
        or confirmed < 0
        or confirmed > total
        or (total > 0 and not isinstance(latest, str))
    ):
        raise ValueError("basketball schedule-clock metadata is malformed")
    if latest is None:
        return total, confirmed, None
    age = (checked_at - timestamp(latest)).total_seconds() / 3600
    if age < -24 or age > max_age_hours:
        raise ValueError(f"basketball schedule-clock evidence is {max(age, 0):.1f} hours old")
    return total, confirmed, max(age, 0)


def forecast_coverage(payload: dict, expected_season: int, expected_rows: int) -> int:
    """Require the exact model edition to have one row for every upcoming game."""
    total = payload.get("total")
    if (
        payload.get("season") != expected_season
        or payload.get("status") != "upcoming"
        or not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or total != expected_rows
    ):
        raise ValueError("latest basketball model does not cover every upcoming game")
    return total


def forecast_scorecard_coverage(
    payload: dict,
    sport: str,
    expected_model_id: str,
) -> tuple[int, int]:
    """Require the live scorecard to expose the catalog's exact model edition.

    Forecast catalogs and the append-only research ledger are published from
    separate stores. A stale ledger can therefore leave the forecast board
    healthy while an exact model scorecard request returns no rows, silently
    removing model-versus-market evidence from matchup pages. Keep this gate
    model-scoped and count only comparisons on rows that repeat that model ID.
    A zero comparison count remains valid when no licensed/public quote passed
    the timing gates; a zero forecast-row count is a publication failure.
    """
    if not isinstance(expected_model_id, str) or not expected_model_id.strip():
        raise ValueError(f"{sport} forecast catalog has no model ID for scorecard check")
    total = payload.get("total")
    rows = payload.get("games")
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total <= 0
        or not isinstance(rows, list)
        or not rows
        or len(rows) > total
    ):
        raise ValueError(f"{sport} scorecard has no rows for the active forecast edition")
    for row in rows:
        if not isinstance(row, dict) or row.get("model_id") != expected_model_id:
            raise ValueError(f"{sport} scorecard returned a stale or unlabeled forecast edition")
    comparisons = 0
    for row in rows:
        value = row.get("comparisons")
        if value is not None and (not isinstance(value, list)):
            raise ValueError(f"{sport} scorecard has malformed market comparisons")
        comparisons += len(value or [])
    return total, comparisons


def validate_forecast_prediction(row: dict) -> dict:
    """Require the published game estimate to reconcile to its model fields.

    The forecast API is the public boundary for both D1-backed rows and the
    static overview fallback. Checking the first row here catches a malformed
    or partially serialized model edition before the homepage presents an
    apparently authoritative prediction. The efficiency fields are derived
    from the same projected score and pace, so they must reconcile within the
    two-decimal publication precision.
    """
    if not isinstance(row, dict) or row.get("prediction_integrity") != "valid":
        raise ValueError("latest basketball model has an invalid prediction payload")
    prediction = row.get("prediction")
    if not isinstance(prediction, dict):
        raise ValueError("latest basketball model has no prediction payload")
    required = (
        "home_score", "away_score", "home_margin", "total", "pace",
        "home_win_probability", "margin_low", "margin_high",
        "home_efficiency", "away_efficiency",
    )
    values: dict[str, float] = {}
    for key in required:
        value = prediction.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError(f"latest basketball model prediction field {key} is malformed")
        values[key] = float(value)
    if values["pace"] <= 0 or values["home_score"] < 0 or values["away_score"] < 0:
        raise ValueError("latest basketball model prediction has invalid score or pace")
    if not 0 <= values["home_win_probability"] <= 1:
        raise ValueError("latest basketball model prediction has invalid win probability")
    if values["margin_low"] > values["margin_high"]:
        raise ValueError("latest basketball model prediction has an inverted margin interval")
    if not values["margin_low"] <= values["home_margin"] <= values["margin_high"]:
        raise ValueError("latest basketball model prediction margin is outside its interval")
    if abs(values["home_margin"] - (values["home_score"] - values["away_score"])) > 0.05:
        raise ValueError("latest basketball model prediction margin does not reconcile")
    if abs(values["total"] - (values["home_score"] + values["away_score"])) > 0.05:
        raise ValueError("latest basketball model prediction total does not reconcile")
    for side in ("home", "away"):
        expected = 100 * values[f"{side}_score"] / values["pace"]
        if abs(values[f"{side}_efficiency"] - expected) > 0.02:
            raise ValueError(f"latest basketball model {side} efficiency does not reconcile")
    return {"estimate_type": prediction.get("estimate_type", "primary"), "pace": values["pace"]}


def validate_forecast_matchup_context(row: dict, expected_model_id: str) -> dict:
    """Report the provenance of a forecast row's four-factor context.

    A factor asset can cover the same game IDs while belonging to an older
    model edition.  That context remains useful as dated descriptive evidence,
    but it must be visible to the publication monitor so a stale asset cannot
    be mistaken for inputs to the current score.  This check therefore
    validates the API's explicit provenance fields without failing a release
    merely because the older context is unavailable or clearly labeled.
    """
    if not isinstance(row, dict):
        raise ValueError("latest basketball model has no inspectable matchup context")
    integrity = row.get("matchup_factors_integrity")
    factors = row.get("matchup_factors")
    source = row.get("matchup_factors_source")
    factor_model_id = row.get("matchup_factors_model_id")
    same_edition = row.get("matchup_factors_same_edition")
    if integrity not in {"valid", "invalid", "unavailable"}:
        raise ValueError("latest basketball model has an invalid matchup context status")
    if integrity == "valid":
        if not isinstance(factors, dict) or source not in {"forecast_payload", "published_asset"}:
            raise ValueError("latest basketball model has incomplete matchup context provenance")
        if not isinstance(factor_model_id, str) or not factor_model_id.strip():
            raise ValueError("latest basketball model matchup context has no model ID")
        if not isinstance(same_edition, bool) or same_edition != (factor_model_id == expected_model_id):
            raise ValueError("latest basketball model matchup context edition flag is inconsistent")
        return {
            "integrity": integrity,
            "source": source,
            "model_id": factor_model_id,
            "same_edition": same_edition,
        }
    if factors is not None or source is not None or factor_model_id is not None or same_edition is not None:
        raise ValueError("latest basketball model has inconsistent unavailable matchup context")
    return {
        "integrity": integrity,
        "source": None,
        "model_id": None,
        "same_edition": None,
    }


def womens_forecast_metadata(payload: dict) -> dict:
    """Validate the source-native published women's forecast asset.

    This intentionally reads the static edition rather than the men's D1
    warehouse. A women-specific model must advertise its scope, publication
    status, held-out evaluation and calibration evidence, and every forecast
    row must retain finite probabilities and interval margins.
    """
    if not isinstance(payload, dict):
        raise ValueError("women's basketball forecast asset is malformed")
    if (
        payload.get("sport") != "basketball"
        or payload.get("gender") != "women"
        or payload.get("target_season") != 2027
        or payload.get("model_status") != "published"
        or not isinstance(payload.get("model_id"), str)
        or not payload["model_id"].strip()
        or not isinstance(payload.get("generated_at"), str)
    ):
        raise ValueError("women's basketball forecast asset has the wrong scope or status")
    try:
        timestamp(payload["generated_at"])
    except (TypeError, ValueError):
        raise ValueError("women's basketball forecast asset has an invalid generation time") from None

    validation_season = payload.get("validation_season")
    if validation_season != 2026:
        raise ValueError("women's basketball forecast asset has no held-out 2026 validation")
    validation = payload.get("validation")
    calibration = payload.get("calibration")
    if not isinstance(validation, dict) or not isinstance(calibration, dict):
        raise ValueError("women's basketball forecast asset is missing validation or calibration")

    def positive_int(value: object, label: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ValueError(f"women's basketball forecast {label} is malformed")
        return value

    def finite(value: object, label: str, *, lower: float | None = None, upper: float | None = None) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError(f"women's basketball forecast {label} is malformed")
        numeric = float(value)
        if lower is not None and numeric < lower or upper is not None and numeric > upper:
            raise ValueError(f"women's basketball forecast {label} is out of range")
        return numeric

    validation_games = positive_int(validation.get("games"), "validation games")
    positive_int(validation.get("interval_games"), "validation interval games")
    finite(validation.get("margin_mae"), "validation margin MAE", lower=0)
    finite(validation.get("win_accuracy"), "validation win accuracy", lower=0, upper=1)
    finite(validation.get("brier_score"), "validation Brier score", lower=0, upper=1)
    finite(validation.get("log_loss"), "validation log loss", lower=0)
    finite(validation.get("interval_coverage"), "validation interval coverage", lower=0, upper=1)

    calibration_games = positive_int(calibration.get("games"), "calibration games")
    if calibration.get("evaluated_season") != 2026:
        raise ValueError("women's basketball forecast calibration has the wrong evaluation season")
    coefficients = calibration.get("logistic_coefficients")
    if (
        not isinstance(coefficients, list)
        or len(coefficients) != 2
        or any(not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value) for value in coefficients)
    ):
        raise ValueError("women's basketball forecast calibration coefficients are malformed")
    finite(calibration.get("margin_half_width"), "calibration margin half-width", lower=0)
    positive_int(calibration.get("interval_games"), "calibration interval games")
    finite(calibration.get("interval_target"), "calibration interval target", lower=0, upper=1)
    finite(calibration.get("brier"), "calibration Brier score", lower=0, upper=1)
    finite(calibration.get("log_loss"), "calibration log loss", lower=0)

    forecasts = payload.get("forecasts")
    if not isinstance(forecasts, list) or not forecasts:
        raise ValueError("women's basketball forecast asset has no forecast rows")
    counts = {"primary": 0, "cold_start": 0}
    for row in forecasts:
        if not isinstance(row, dict) or not isinstance(row.get("game_id"), str) or not re.fullmatch(r"\d{1,30}", row["game_id"]):
            raise ValueError("women's basketball forecast row has an invalid game identity")
        prediction = row.get("prediction")
        if not isinstance(prediction, dict):
            raise ValueError("women's basketball forecast row has no prediction")
        estimate_type = prediction.get("estimate_type")
        if estimate_type not in counts:
            raise ValueError("women's basketball forecast row has an invalid estimate type")
        counts[estimate_type] += 1
        home_probability = finite(prediction.get("home_win_probability"), "home win probability", lower=0, upper=1)
        away_probability = finite(prediction.get("away_win_probability"), "away win probability", lower=0, upper=1)
        if abs(home_probability + away_probability - 1) > 0.002:
            raise ValueError("women's basketball forecast probabilities do not reconcile")
        margin = finite(prediction.get("predicted_margin"), "predicted margin")
        home_score = finite(prediction.get("predicted_home_score"), "predicted home score", lower=0)
        away_score = finite(prediction.get("predicted_away_score"), "predicted away score", lower=0)
        if abs(home_score - away_score - margin) > 0.11:
            raise ValueError("women's basketball forecast scores do not reconcile with margin")
        low = finite(prediction.get("margin_low"), "margin low")
        high = finite(prediction.get("margin_high"), "margin high")
        if low > high or not low <= margin <= high:
            raise ValueError("women's basketball forecast margin interval is malformed")
        if payload["model_id"].startswith("womens-basketball-opponent-adjusted-v4-"):
            inputs = prediction.get("model_inputs")
            if not isinstance(inputs, dict):
                raise ValueError("women's basketball forecast adjusted inputs are missing")
            keys = (
                "home_adjusted_offense", "home_adjusted_defense",
                "away_adjusted_offense", "away_adjusted_defense",
                "home_adjusted_net", "away_adjusted_net", "neutral_court_edge",
                "home_court_adjustment", "league_average_points",
            )
            values = {key: finite(inputs.get(key), f"adjusted input {key}") for key in keys}
            if values["league_average_points"] <= 0:
                raise ValueError("women's basketball forecast adjusted scoring environment is malformed")
            if (
                abs(values["home_adjusted_net"] - (values["home_adjusted_offense"] - values["home_adjusted_defense"])) > 0.04
                or abs(values["away_adjusted_net"] - (values["away_adjusted_offense"] - values["away_adjusted_defense"])) > 0.04
                or abs(values["neutral_court_edge"] - (values["home_adjusted_net"] - values["away_adjusted_net"])) > 0.04
                or abs(margin - (values["neutral_court_edge"] + values["home_court_adjustment"])) > 0.11
            ):
                raise ValueError("women's basketball forecast adjusted units do not reconcile")
            expected_home = values["home_adjusted_offense"] + values["away_adjusted_defense"] - values["league_average_points"] + values["home_court_adjustment"] / 2
            expected_away = values["away_adjusted_offense"] + values["home_adjusted_defense"] - values["league_average_points"] - values["home_court_adjustment"] / 2
            if abs(home_score - expected_home) > 0.11 or abs(away_score - expected_away) > 0.11:
                raise ValueError("women's basketball forecast adjusted units do not reproduce scores")

    coverage = payload.get("coverage")
    if not isinstance(coverage, dict):
        raise ValueError("women's basketball forecast coverage is malformed")
    forecast_rows = positive_int(coverage.get("forecast_rows"), "coverage forecast rows")
    primary_rows = positive_int(coverage.get("primary_rows"), "coverage primary rows")
    cold_start_rows = coverage.get("cold_start_rows")
    if isinstance(cold_start_rows, bool) or not isinstance(cold_start_rows, int) or cold_start_rows < 0:
        raise ValueError("women's basketball forecast coverage cold-start rows are malformed")
    positive_int(coverage.get("rated_teams"), "coverage rated teams")
    if forecast_rows != len(forecasts) or primary_rows != counts["primary"] or cold_start_rows != counts["cold_start"] or primary_rows + cold_start_rows != forecast_rows:
        raise ValueError("women's basketball forecast coverage does not reconcile")
    return {
        "model_id": payload["model_id"],
        "forecast_rows": forecast_rows,
        "primary_rows": primary_rows,
        "cold_start_rows": cold_start_rows,
        "validation_games": validation_games,
        "calibration_games": calibration_games,
    }


def womens_lower_division_metadata(
    payload: dict,
    checked_at: datetime,
    max_age_hours: float,
) -> dict:
    """Validate the read-only NCAA.com women’s D2/D3 edition.

    These tables are useful source evidence, but NCAA.com does not expose a
    stable athlete ID in the rendered rows. The monitor therefore verifies
    explicit route scope and receipt integrity while refusing to treat the
    rows as an identity-linked player archive.
    """
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise ValueError("women's lower-division statistics asset is malformed")
    generated_at = payload.get("generated_at")
    try:
        generated = timestamp(generated_at)
    except (TypeError, ValueError):
        raise ValueError("women's lower-division statistics asset has an invalid generation time") from None
    age = (checked_at - generated).total_seconds() / 3600
    if age < -24 or age > max_age_hours:
        raise ValueError(f"women's lower-division statistics asset is {max(age, 0):.1f} hours old")
    source = payload.get("source")
    if (
        not isinstance(source, dict)
        or source.get("publisher") != "NCAA.com"
        or not isinstance(source.get("limitation"), str)
        or "athlete ID" not in source["limitation"]
    ):
        raise ValueError("women's lower-division statistics source contract is malformed")
    receipts = payload.get("receipts")
    if not isinstance(receipts, list) or not receipts:
        raise ValueError("women's lower-division statistics asset has no receipts")
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("url"), str)
            or not receipt["url"].startswith("https://www.ncaa.com/stats/basketball-women/")
            or receipt.get("status") != 200
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
            or not isinstance(receipt.get("bytes"), int)
            or receipt["bytes"] <= 0
        ):
            raise ValueError("women's lower-division statistics receipt is malformed")
    divisions = payload.get("divisions")
    if not isinstance(divisions, dict):
        raise ValueError("women's lower-division statistics has no division map")
    summary: dict[str, object] = {"receipt_count": len(receipts), "generated_age_hours": max(age, 0)}
    for division in ("d2", "d3"):
        record = divisions.get(division)
        expected_division = int(division[1])
        if (
            not isinstance(record, dict)
            or record.get("source_scope") != {"sport": "basketball", "gender": "women", "division": expected_division}
            or record.get("identity_status") != "source_names_and_team_slugs_only"
            or not isinstance(record.get("identity_note"), str)
        ):
            raise ValueError(f"women's lower-division {division} scope or identity contract is malformed")
        counts: dict[str, int] = {}
        for kind in ("individual", "team"):
            tables = record.get(kind)
            if not isinstance(tables, list) or not tables:
                raise ValueError(f"women's lower-division {division} has no {kind} tables")
            total = 0
            for table in tables:
                if (
                    not isinstance(table, dict)
                    or not isinstance(table.get("source_url"), str)
                    or not table["source_url"].startswith(f"https://www.ncaa.com/stats/basketball-women/{division}/")
                    or not isinstance(table.get("headers"), list)
                    or not table["headers"]
                    or not isinstance(table.get("rows"), list)
                    or not table["rows"]
                ):
                    raise ValueError(f"women's lower-division {division} {kind} table is malformed")
                for row in table["rows"]:
                    if not isinstance(row, dict) or "athlete_id" in row:
                        raise ValueError(f"women's lower-division {division} row has an unsafe identity field")
                total += len(table["rows"])
            counts[kind] = total
        summary[division] = {
            "individual_rows": counts["individual"],
            "team_rows": counts["team"],
            "individual_statistics": len(record["individual"]),
            "team_statistics": len(record["team"]),
        }
    return summary


def womens_lower_schedule_archive_metadata(payload: dict) -> dict:
    """Validate the exact-division historical women’s schedule archive.

    The archive is intentionally checked separately from the current-season
    forecast release: completed-season contests can prove the capture and
    identity contract even when the target-season endpoint has not published
    any rows yet.
    """
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise ValueError("women's lower-division schedule asset is malformed")
    source = payload.get("source")
    if (
        not isinstance(source, dict)
        or source.get("publisher") != "NCAA.com"
        or not isinstance(source.get("season_year"), int)
        or source.get("season_year") <= 0
        or not isinstance(source.get("identity_limit"), str)
    ):
        raise ValueError("women's lower-division schedule source contract is malformed")
    receipts = payload.get("receipts")
    if not isinstance(receipts, list) or not receipts:
        raise ValueError("women's lower-division schedule asset has no receipts")
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("url"), str)
            or not receipt["url"].startswith("https://sdataprod.ncaa.com?")
            or receipt.get("status") != 200
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
            or not isinstance(receipt.get("bytes"), int)
            or receipt["bytes"] <= 0
        ):
            raise ValueError("women's lower-division schedule receipt is malformed")
    calendar = payload.get("calendar")
    if not isinstance(calendar, list) or not calendar:
        raise ValueError("women's lower-division schedule has no calendar rows")
    calendar_counts = {"d2": 0, "d3": 0}
    for day in calendar:
        if (
            not isinstance(day, dict)
            or day.get("sport") != "basketball"
            or day.get("gender") != "women"
            or day.get("division") not in (2, 3)
            or not isinstance(day.get("contest_date"), str)
            or not isinstance(day.get("count"), int)
            or isinstance(day.get("count"), bool)
            or day["count"] < 0
        ):
            raise ValueError("women's lower-division schedule calendar row is malformed")
        calendar_counts[f"d{day['division']}"] += day["count"]
    contests = payload.get("contests")
    if not isinstance(contests, list) or not contests:
        raise ValueError("women's lower-division schedule has no contests")
    seen: set[tuple[int, int]] = set()
    contest_counts = {"d2": 0, "d3": 0}
    for contest in contests:
        if (
            not isinstance(contest, dict)
            or contest.get("sport") != "basketball"
            or contest.get("gender") != "women"
            or contest.get("division") not in (2, 3)
            or not isinstance(contest.get("contest_id"), int)
            or contest["contest_id"] <= 0
            or not isinstance(contest.get("teams"), list)
            or len(contest["teams"]) != 2
        ):
            raise ValueError("women's lower-division schedule contest is malformed")
        key = (contest["division"], contest["contest_id"])
        if key in seen:
            raise ValueError("women's lower-division schedule has duplicate contest IDs")
        seen.add(key)
        for team in contest["teams"]:
            if (
                not isinstance(team, dict)
                or not isinstance(team.get("name"), str)
                or not team["name"].strip()
                or (team.get("slug") is not None and not isinstance(team.get("slug"), str))
            ):
                raise ValueError("women's lower-division schedule team identity is malformed")
        contest_counts[f"d{contest['division']}"] += 1
    if any(contest_counts[key] > calendar_counts[key] for key in ("d2", "d3")):
        raise ValueError("women's lower-division schedule exceeds its calendar counts")
    return {
        "season_year": source["season_year"],
        "receipt_count": len(receipts),
        "contests": len(contests),
        "d2_contests": contest_counts["d2"],
        "d3_contests": contest_counts["d3"],
        "calendar_d2": calendar_counts["d2"],
        "calendar_d3": calendar_counts["d3"],
    }


def _lower_ratings_metadata(payload: dict, *, gender: str, model_prefix: str, label: str) -> dict:
    """Validate a research-only exact-scope D2/D3 rating artifact.

    The lower-division rating board is deliberately separate from the D1
    forecast edition.  Validate its identity and forecast gate here so a
    deploy cannot silently publish a malformed or falsely prospective board.
    """
    if (
        not isinstance(payload, dict)
        or payload.get("schema_version") != 1
        or payload.get("sport") != "basketball"
        or payload.get("gender") != gender
        or payload.get("model_status") != "research_only"
        or payload.get("forecast_status") != "not_published"
        or payload.get("target_season") != 2027
    ):
        raise ValueError(f"{label} lower-division ratings artifact has an invalid publication contract")
    generated_at = payload.get("generated_at")
    try:
        timestamp(generated_at)
    except (TypeError, ValueError):
        raise ValueError(f"{label} lower-division ratings artifact has an invalid generation time") from None
    divisions = payload.get("divisions")
    if not isinstance(divisions, dict):
        raise ValueError(f"{label} lower-division ratings artifact has no division map")
    summary: dict[str, object] = {}
    for division in ("d2", "d3"):
        record = divisions.get(division)
        if (
            not isinstance(record, dict)
            or record.get("division") != int(division[1])
            or record.get("model_status") != "research_only"
            or record.get("forecast_status") != "not_published"
            or not isinstance(record.get("model_id"), str)
            or not record["model_id"].startswith(f"{model_prefix}-{division}-")
        ):
            raise ValueError(f"{label} lower-division {division} ratings scope is malformed")
        coverage = record.get("coverage")
        if (
            not isinstance(coverage, dict)
            or not isinstance(coverage.get("valid_final_games"), int)
            or coverage["valid_final_games"] <= 0
            or not isinstance(coverage.get("teams"), int)
            or coverage["teams"] <= 0
            or not isinstance(coverage.get("source_receipts"), int)
            or coverage["source_receipts"] <= 0
            or not isinstance(coverage.get("excluded"), dict)
        ):
            raise ValueError(f"{label} lower-division {division} ratings coverage is malformed")
        ratings = record.get("ratings")
        if not isinstance(ratings, list) or len(ratings) != coverage["teams"]:
            raise ValueError(f"{label} lower-division {division} ratings do not reconcile with team coverage")
        ranks = []
        seen_team_ids: set[str] = set()
        for row in ratings:
            if (
                not isinstance(row, dict)
                or not isinstance(row.get("rank"), int)
                or row["rank"] <= 0
                or not isinstance(row.get("team_id"), str)
                or not row["team_id"]
                or row["team_id"] in seen_team_ids
                or not isinstance(row.get("team"), str)
                or not row["team"].strip()
                or not isinstance(row.get("games"), int)
                or row["games"] <= 0
            ):
                raise ValueError(f"{label} lower-division {division} rating row is malformed")
            seen_team_ids.add(row["team_id"])
            ranks.append(row["rank"])
        if sorted(ranks) != list(range(1, len(ratings) + 1)):
            raise ValueError(f"{label} lower-division {division} ratings have non-contiguous ranks")
        target_schedule = record.get("target_schedule")
        if (
            not isinstance(target_schedule, dict)
            or target_schedule.get("season") != 2027
            or target_schedule.get("status") != "missing"
            or target_schedule.get("games") != 0
            or not isinstance(target_schedule.get("note"), str)
        ):
            raise ValueError(f"{label} lower-division {division} forecast gate is malformed")
        source = record.get("source")
        if (
            not isinstance(source, dict)
            or not isinstance(source.get("schedule_asset_sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", source["schedule_asset_sha256"])
            or not isinstance(source.get("receipt_count"), int)
            or source["receipt_count"] <= 0
            or not isinstance(source.get("receipt_digest"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", source["receipt_digest"])
        ):
            raise ValueError(f"{label} lower-division {division} ratings source evidence is malformed")
        summary[division] = {
            "valid_final_games": coverage["valid_final_games"],
            "teams": coverage["teams"],
            "receipt_count": coverage["source_receipts"],
            "model_id": record["model_id"],
            "forecast_status": record["forecast_status"],
        }
    return summary


def womens_lower_ratings_metadata(payload: dict) -> dict:
    return _lower_ratings_metadata(payload, gender="women", model_prefix="wbb-lower-ratings-v1", label="women's")


def mens_lower_ratings_metadata(payload: dict) -> dict:
    return _lower_ratings_metadata(payload, gender="men", model_prefix="mbb-lower-ratings-v1", label="men's")


def lower_division_target_probe_metadata(
    payload: dict,
    expected_sport_code: str,
    checked_at: datetime,
    max_age_hours: float,
) -> dict:
    """Validate the receipt-backed target-season availability probe.

    An empty NCAA response is evidence that the endpoint was checked, not a
    schedule.  The probe remains useful only while its scope, response
    receipts, and freshness are explicit.
    """
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise ValueError("lower-division target probe is malformed")
    generated_at = payload.get("generated_at")
    try:
        generated = timestamp(generated_at)
    except (TypeError, ValueError):
        raise ValueError("lower-division target probe has an invalid generation time") from None
    age = (checked_at - generated).total_seconds() / 3600
    if age < -24 or age > max_age_hours:
        raise ValueError(f"lower-division target probe is {max(age, 0):.1f} hours old")
    if payload.get("target_season") != "2026-27":
        raise ValueError("lower-division target probe has the wrong target season")
    months = payload.get("requested_months")
    if not isinstance(months, list) or months != [9, 10, 11]:
        raise ValueError("lower-division target probe has an incomplete month window")
    source = payload.get("source")
    if (
        not isinstance(source, dict)
        or source.get("publisher") != "NCAA.com"
        or source.get("season_year") != 2026
        or not isinstance(source.get("method"), str)
        or expected_sport_code not in source["method"]
        or not isinstance(source.get("query_contract"), dict)
        or not isinstance(source.get("identity_limit"), str)
        or "no name-only" not in source["identity_limit"].casefold()
    ):
        raise ValueError("lower-division target probe source contract is malformed")
    calendar = payload.get("calendar")
    contests = payload.get("contests")
    receipts = payload.get("receipts")
    if not isinstance(calendar, list) or not isinstance(contests, list) or not isinstance(receipts, list) or not receipts:
        raise ValueError("lower-division target probe has incomplete response evidence")
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("url"), str)
            or not receipt["url"].startswith("https://sdataprod.ncaa.com?")
            or receipt.get("status") != 200
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
            or not isinstance(receipt.get("bytes"), int)
            or receipt["bytes"] <= 0
        ):
            raise ValueError("lower-division target probe receipt is malformed")
    return {
        "target_season": payload["target_season"],
        "calendar_days": len(calendar),
        "contests": len(contests),
        "receipt_count": len(receipts),
        "generated_age_hours": round(max(age, 0), 2),
    }


def mens_lower_schedule_archive_metadata(payload: dict) -> dict:
    """Validate the exact-division historical men’s schedule archive.

    The archive is intentionally checked separately from the current-season
    forecast release: completed-season contests can prove the capture and
    identity contract even when the target-season endpoint has not published
    any rows yet.
    """
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise ValueError("men's lower-division schedule asset is malformed")
    source = payload.get("source")
    if (
        not isinstance(source, dict)
        or source.get("publisher") != "NCAA.com"
        or not isinstance(source.get("season_year"), int)
        or source.get("season_year") <= 0
        or not isinstance(source.get("identity_limit"), str)
    ):
        raise ValueError("men's lower-division schedule source contract is malformed")
    receipts = payload.get("receipts")
    if not isinstance(receipts, list) or not receipts:
        raise ValueError("men's lower-division schedule asset has no receipts")
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("url"), str)
            or not receipt["url"].startswith("https://sdataprod.ncaa.com?")
            or receipt.get("status") != 200
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
            or not isinstance(receipt.get("bytes"), int)
            or receipt["bytes"] <= 0
        ):
            raise ValueError("men's lower-division schedule receipt is malformed")
    calendar = payload.get("calendar")
    if not isinstance(calendar, list) or not calendar:
        raise ValueError("men's lower-division schedule has no calendar rows")
    calendar_counts = {"d2": 0, "d3": 0}
    for day in calendar:
        if (
            not isinstance(day, dict)
            or day.get("sport") != "basketball"
            or day.get("gender") != "men"
            or day.get("division") not in (2, 3)
            or not isinstance(day.get("contest_date"), str)
            or not isinstance(day.get("count"), int)
            or isinstance(day.get("count"), bool)
            or day["count"] < 0
        ):
            raise ValueError("men's lower-division schedule calendar row is malformed")
        calendar_counts[f"d{day['division']}"] += day["count"]
    contests = payload.get("contests")
    if not isinstance(contests, list) or not contests:
        raise ValueError("men's lower-division schedule has no contests")
    seen: set[tuple[int, int]] = set()
    contest_counts = {"d2": 0, "d3": 0}
    for contest in contests:
        if (
            not isinstance(contest, dict)
            or contest.get("sport") != "basketball"
            or contest.get("gender") != "men"
            or contest.get("division") not in (2, 3)
            or not isinstance(contest.get("contest_id"), int)
            or contest["contest_id"] <= 0
            or not isinstance(contest.get("teams"), list)
            or len(contest["teams"]) != 2
        ):
            raise ValueError("men's lower-division schedule contest is malformed")
        key = (contest["division"], contest["contest_id"])
        if key in seen:
            raise ValueError("men's lower-division schedule has duplicate contest IDs")
        seen.add(key)
        for team in contest["teams"]:
            if (
                not isinstance(team, dict)
                or not isinstance(team.get("name"), str)
                or not team["name"].strip()
                or (team.get("slug") is not None and not isinstance(team.get("slug"), str))
            ):
                raise ValueError("men's lower-division schedule team identity is malformed")
        contest_counts[f"d{contest['division']}"] += 1
    if any(contest_counts[key] > calendar_counts[key] for key in ("d2", "d3")):
        raise ValueError("men's lower-division schedule exceeds its calendar counts")
    return {
        "season_year": source["season_year"],
        "receipt_count": len(receipts),
        "contests": len(contests),
        "d2_contests": contest_counts["d2"],
        "d3_contests": contest_counts["d3"],
        "calendar_d2": calendar_counts["d2"],
        "calendar_d3": calendar_counts["d3"],
    }


def roster_forecast_alignment(payload: dict, expected_model_id: str) -> int:
    """Require the roster challenger to name the exact primary forecast edition."""
    model = payload.get("roster_model")
    alignment = payload.get("roster_alignment")
    if (
        not isinstance(model, dict)
        or model.get("primary_model_id") != expected_model_id
        or not isinstance(model.get("scenario_games"), int)
        or isinstance(model.get("scenario_games"), bool)
        or model["scenario_games"] <= 0
        or not isinstance(alignment, dict)
        or alignment.get("resolved_model_id") != expected_model_id
        or alignment.get("roster_primary_model_id") != expected_model_id
        or alignment.get("compatible") is not True
        or alignment.get("status") != "matched"
    ):
        raise ValueError("basketball roster challenger is not aligned to the latest forecast model")
    return model["scenario_games"]


def matchup_personnel_coverage(
    payload: dict,
    forecast: dict,
    checked_at: datetime,
    max_age_hours: float,
) -> dict:
    """Validate exact-game roster evidence against the selected forecast row."""
    forecast_season = forecast.get("season")
    forecast_game_id = forecast.get("game_id")
    forecast_home_id = forecast.get("home_id")
    forecast_away_id = forecast.get("away_id")
    if (
        not isinstance(forecast_season, int)
        or isinstance(forecast_season, bool)
        or not isinstance(forecast_game_id, str)
        or not isinstance(forecast_home_id, str)
        or not isinstance(forecast_away_id, str)
    ):
        raise ValueError("basketball forecast game identity is malformed")
    game = payload.get("game")
    coverage = payload.get("coverage")
    receipts = payload.get("source_receipts")
    if (
        payload.get("season") != forecast_season
        or payload.get("prior_season") != forecast_season - 1
        or not isinstance(game, dict)
        or game.get("id") != forecast_game_id
        or game.get("home_id") != forecast_home_id
        or game.get("away_id") != forecast_away_id
        or not isinstance(coverage, dict)
        or not isinstance(receipts, list)
        or not receipts
        or not isinstance(payload.get("identity_policy"), str)
        or not payload["identity_policy"].strip()
    ):
        raise ValueError("basketball matchup personnel identity is malformed")

    statuses = {"returning", "incoming", "new_to_dataset", "ambiguous"}
    coverage_keys = (
        "listed_players", "players_with_prior_minutes",
        "players_with_publisher_stats", "players_with_box_bpm",
    )
    totals = {key: 0 for key in coverage_keys}
    seen: set[tuple[str, str]] = set()
    for side_name, expected_team in (("home", forecast_home_id), ("away", forecast_away_id)):
        side = payload.get(side_name)
        if not isinstance(side, dict) or side.get("team_id") != expected_team:
            raise ValueError("basketball matchup personnel side identity is malformed")
        players = side.get("players")
        side_keys = coverage_keys + (
            "returning_players", "incoming_players",
            "new_to_dataset_players", "ambiguous_players",
        )
        if (
            not isinstance(players, list)
            or not players
            or any(
                not isinstance(side.get(key), int)
                or isinstance(side.get(key), bool)
                or side[key] < 0
                for key in side_keys
            )
            or side["listed_players"] != len(players)
        ):
            raise ValueError("basketball matchup personnel coverage is malformed")
        computed_statuses = {status: 0 for status in statuses}
        computed_minutes = computed_stats = computed_bpm = 0
        for player in players:
            if (
                not isinstance(player, dict)
                or player.get("team_id") != expected_team
                or not isinstance(player.get("athlete_id"), str)
                or not player["athlete_id"].strip()
                or not isinstance(player.get("name"), str)
                or not player["name"].strip()
                or player.get("status") not in statuses
                or not isinstance(player.get("prior_stints"), list)
            ):
                raise ValueError("basketball matchup personnel player row is malformed")
            identity = (expected_team, player["athlete_id"])
            if identity in seen:
                raise ValueError("basketball matchup personnel contains a duplicate roster identity")
            seen.add(identity)
            computed_statuses[player["status"]] += 1
            prior_minutes = player.get("prior_minutes")
            if prior_minutes is not None:
                if not isinstance(prior_minutes, (int, float)) or isinstance(prior_minutes, bool) or prior_minutes < 0:
                    raise ValueError("basketball matchup personnel prior minutes are malformed")
                computed_minutes += 1
            has_stats = has_bpm = False
            for stint in player["prior_stints"]:
                stats = stint.get("stats") if isinstance(stint, dict) else None
                if (
                    not isinstance(stint, dict)
                    or not isinstance(stint.get("team_id"), str)
                    or not stint["team_id"].strip()
                    or not isinstance(stats, dict)
                ):
                    raise ValueError("basketball matchup personnel prior stint is malformed")
                for metric in ("ppg", "rpg", "apg"):
                    value = stats.get(metric)
                    if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool)):
                        raise ValueError("basketball matchup personnel stat value is malformed")
                    has_stats = has_stats or value is not None
                bpm = stint.get("box_bpm")
                if bpm is not None and (not isinstance(bpm, (int, float)) or isinstance(bpm, bool)):
                    raise ValueError("basketball matchup personnel Box BPM is malformed")
                has_bpm = has_bpm or bpm is not None
            computed_stats += int(has_stats)
            computed_bpm += int(has_bpm)
        expected_statuses = {
            "returning": side["returning_players"],
            "incoming": side["incoming_players"],
            "new_to_dataset": side["new_to_dataset_players"],
            "ambiguous": side["ambiguous_players"],
        }
        if (
            computed_statuses != expected_statuses
            or computed_minutes != side["players_with_prior_minutes"]
            or computed_stats != side["players_with_publisher_stats"]
            or computed_bpm != side["players_with_box_bpm"]
        ):
            raise ValueError("basketball matchup personnel coverage does not reconcile")
        for key in coverage_keys:
            totals[key] += side[key]

    if any(coverage.get(key) != totals[key] for key in coverage_keys):
        raise ValueError("basketball matchup personnel total coverage does not reconcile")
    if totals["listed_players"] <= 0 or totals["players_with_prior_minutes"] <= 0 or totals["players_with_publisher_stats"] <= 0:
        raise ValueError("basketball matchup personnel has no usable player evidence")

    receipt_ages = []
    for receipt in receipts:
        if (
            not isinstance(receipt, dict)
            or not isinstance(receipt.get("dataset"), str)
            or receipt.get("season") not in {payload["prior_season"], payload["season"]}
            or not isinstance(receipt.get("fetched_at"), str)
            or not isinstance(receipt.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"])
        ):
            raise ValueError("basketball matchup personnel source receipt is malformed")
        age = (checked_at - timestamp(receipt["fetched_at"])).total_seconds() / 3600
        if age < -24 or age > max_age_hours:
            raise ValueError(f"basketball matchup personnel source is {max(age, 0):.1f} hours old")
        receipt_ages.append(age)
    return {
        **totals,
        "source_receipts": len(receipts),
        "source_max_age_hours": max(receipt_ages),
    }


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
        numeric_observed = item.get("numeric_observed")
        numeric_share = item.get("numeric_share")
        if (
            not isinstance(observed, int)
            or isinstance(observed, bool)
            or observed < 0
            or observed > rows
            or not isinstance(share, (int, float))
            or isinstance(share, bool)
            or not 0 <= share <= 1
            or not isinstance(numeric_observed, int)
            or isinstance(numeric_observed, bool)
            or numeric_observed < 0
            or numeric_observed > rows
            or not isinstance(numeric_share, (int, float))
            or isinstance(numeric_share, bool)
            or not 0 <= numeric_share <= 1
            or numeric_observed > observed
        ):
            raise ValueError("NCAA player box field coverage is malformed")
    required = {"pts", "mins", "fga", "fgm", "fta", "ftm", "ast", "orb", "drb"}
    if any(
        field not in coverage or not isinstance(coverage[field].get("numeric_observed"), int)
        or coverage[field]["numeric_observed"] <= 0
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
    """Validate the provider-neutral reviewed recruiting edition.

    The public Worker deliberately removes the raw ``sources`` array and
    exposes only a receipt summary.  Keep accepting the older internal shape
    for archived monitor fixtures, while validating the safe public contract
    when it is present.
    """
    release_coverage = payload.get("coverage")
    required_counts = ("programs", "players", "events", "sources")
    sources = payload.get("sources")
    source_receipt = payload.get("source_receipt")
    reviewed_at = payload.get("reviewed_at") or payload.get("first_recorded_at")
    coverage_source_count = release_coverage.get("sources") if isinstance(release_coverage, dict) else None
    if isinstance(source_receipt, dict):
        source_count = source_receipt.get("source_rows")
        receipt_hash = source_receipt.get("sha256")
        receipt_valid = (
            source_receipt.get("integrity") == "verified"
            and isinstance(source_count, int)
            and source_count > 0
            and isinstance(receipt_hash, str)
            and re.fullmatch(r"[0-9a-f]{64}", receipt_hash) is not None
            and isinstance(reviewed_at, str)
        )
        source_shape_valid = receipt_valid and source_count == coverage_source_count
    else:
        source_shape_valid = (
            isinstance(reviewed_at, str)
            and isinstance(sources, list)
            and len(sources) == coverage_source_count
            and all(
                isinstance(source, dict)
                and isinstance(source.get("source_sha256"), str)
                and re.fullmatch(r"[0-9a-f]{64}", source["source_sha256"]) is not None
                for source in sources
            )
        )
    if (
        payload.get("season") != 2027
        or not isinstance(release_coverage, dict)
        or not source_shape_valid
        or any(
            not isinstance(release_coverage.get(key), int)
            or release_coverage[key] <= 0
            for key in required_counts
        )
    ):
        raise ValueError("reviewed recruiting release is malformed or empty")
    age = (checked_at - timestamp(reviewed_at)).total_seconds() / 3600
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


def check_live(
    base_url: str,
    *,
    now: datetime | None = None,
    max_age_hours: float = DAILY_PUBLICATION_MAX_AGE_HOURS,
) -> dict:
    checked_at = now or datetime.now(timezone.utc)
    probe_key = str(int(checked_at.timestamp()))
    health = get_json(base_url, "/api/health")
    if health.get("ok") is not True:
        raise ValueError("Worker health response is not ok")

    basketball = get_json(
        base_url,
        f"/api/basketball/research/coverage?audit=1&publication_check={probe_key}",
    )
    required = {"coverage", "source_receipts", "audit_status", "location_validation", "possession_validation"}
    if not required.issubset(basketball):
        raise ValueError(f"basketball coverage is missing {sorted(required - set(basketball))}")
    if not isinstance(basketball["coverage"], list) or not basketball["coverage"]:
        raise ValueError("basketball coverage has no dataset rows")
    validate_coverage_audit(basketball)
    ages = receipt_ages(
        basketball,
        "basketball",
        checked_at,
        max_age_hours,
        archival_datasets={"ncaa_individual"},
    )

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
    model_id = latest.get("model_id")
    if not isinstance(model_id, str) or not model_id.strip():
        raise ValueError("basketball forecast catalog has no model ID")
    last_created = latest.get("last_created_at")
    if not isinstance(last_created, str):
        raise ValueError("basketball forecast catalog has no model clock")
    model_age = (checked_at - timestamp(last_created)).total_seconds() / 3600
    if model_age < -24 or model_age > max_age_hours:
        raise ValueError(f"latest basketball model is {max(model_age, 0):.1f} hours old")
    # Distinct probe key prevents a monitor from validating a stale edge-cache
    # response after a publisher sync.
    upcoming_forecasts = get_json(
        base_url,
        f"/api/basketball/research/forecasts?season=2027&status=upcoming&model={quote(model_id, safe='')}&roster=1&limit=1&page=0&publication_check={probe_key}",
    )
    upcoming_forecast_rows = forecast_coverage(upcoming_forecasts, 2027, latest["forecasts"])
    roster_scenario_rows = roster_forecast_alignment(upcoming_forecasts, model_id)
    upcoming_rows = upcoming_forecasts.get("rows")
    if not isinstance(upcoming_rows, list) or not upcoming_rows or not isinstance(upcoming_rows[0], dict):
        raise ValueError("latest basketball model has no inspectable upcoming game")
    personnel_game = upcoming_rows[0]
    game_id = personnel_game.get("game_id")
    if not isinstance(game_id, str) or not re.fullmatch(r"\d{1,20}", game_id):
        raise ValueError("latest basketball model has an invalid game identity")
    forecast_prediction = validate_forecast_prediction(personnel_game)
    # Probe the ordinary upcoming board separately from the roster challenger:
    # the latter intentionally suppresses static factor attachment. This
    # keeps the publication report honest about whether the visible factor
    # context belongs to the exact forecast edition or is older descriptive
    # evidence.
    factor_probe = get_json(
        base_url,
        f"/api/basketball/research/forecasts?season=2027&status=upcoming&model=latest&limit=1&page=0&publication_check={probe_key}",
    )
    factor_probe_rows = factor_probe.get("rows")
    if not isinstance(factor_probe_rows, list) or not factor_probe_rows or not isinstance(factor_probe_rows[0], dict):
        raise ValueError("latest basketball model has no inspectable matchup context row")
    forecast_matchup_context = validate_forecast_matchup_context(factor_probe_rows[0], model_id)
    womens_forecast = womens_forecast_metadata(
        get_json(base_url, "/data/basketball/womens-forecast.json")
    )
    womens_lower_division = womens_lower_division_metadata(
        get_json(base_url, "/data/basketball/womens-lower-division-stats.json"),
        checked_at,
        max_age_hours,
    )
    womens_lower_schedule = womens_lower_schedule_archive_metadata(
        get_json(base_url, "/data/basketball/womens-lower-division-schedules.json")
    )
    womens_lower_ratings = womens_lower_ratings_metadata(
        get_json(base_url, "/data/basketball/womens-lower-division-ratings.json")
    )
    womens_lower_target_probe = lower_division_target_probe_metadata(
        get_json(base_url, "/data/basketball/womens-lower-division-target-probe.json"),
        "WBB",
        checked_at,
        max_age_hours,
    )
    mens_lower_schedule = mens_lower_schedule_archive_metadata(
        get_json(base_url, "/data/basketball/mens-lower-division-schedules.json")
    )
    mens_lower_ratings = mens_lower_ratings_metadata(
        get_json(base_url, "/data/basketball/mens-lower-division-ratings.json")
    )
    mens_lower_target_probe = lower_division_target_probe_metadata(
        get_json(base_url, "/data/basketball/mens-lower-division-target-probe.json"),
        "MBB",
        checked_at,
        max_age_hours,
    )
    matchup_personnel = get_json(
        base_url,
        f"/api/basketball/research/matchup-personnel?season=2027&gameId={quote(game_id, safe='')}&publication_check={probe_key}",
    )
    matchup_personnel_summary = matchup_personnel_coverage(
        matchup_personnel, personnel_game, checked_at, max_age_hours
    )
    scorecard = get_json(
        base_url,
        f"/api/research/scorecard?sport=basketball&season=2027&status=excluded&limit=1&publication_check={probe_key}",
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
    football_model_id = football_latest.get("model_id")
    if not isinstance(football_model_id, str) or not football_model_id.strip():
        raise ValueError("football forecast catalog has no model ID")
    football_last_created = football_latest.get("last_created_at")
    if not isinstance(football_last_created, str):
        raise ValueError("football forecast catalog has no model clock")
    football_model_age = (checked_at - timestamp(football_last_created)).total_seconds() / 3600
    if football_model_age < -24 or football_model_age > max_age_hours:
        raise ValueError(f"latest football model is {max(football_model_age, 0):.1f} hours old")
    football_scorecard = get_json(
        base_url,
        f"/api/research/scorecard?sport=football&season=2026&model={quote(football_model_id, safe='')}&status=all&limit=1&publication_check={probe_key}",
    )
    football_scorecard_rows, football_scorecard_comparisons = forecast_scorecard_coverage(
        football_scorecard,
        "football",
        football_model_id,
    )
    football_personnel_readiness, football_personnel_readiness_age = football_personnel_readiness_metadata(
        get_json(base_url, "/data/football/personnel-readiness-2026.json"),
        checked_at,
        max_age_hours,
        expected_model_id=football_model_id,
    )

    schedule_clock_total = schedule_clock_confirmed = 0
    schedule_clock_age: float | None = None
    schedule_clock_error: ValueError | None = None
    # A deploy can leave one edge location serving the previous metadata
    # contract for a short interval. Retry semantic shape failures with a
    # distinct probe key so the monitor does not report a false outage while
    # the new Worker propagates. HTTP failures are already retried by
    # get_json; this loop covers a valid 200 response with stale fields.
    for schedule_retry in range(3):
        schedule_clock = get_json(
            base_url,
            f"/api/basketball/research/schedule-times?season=2027&meta=1&publication_check={probe_key}{schedule_retry or ''}",
        )
        try:
            schedule_clock_total, schedule_clock_confirmed, schedule_clock_age = schedule_clock_metadata(schedule_clock, checked_at, max_age_hours)
            schedule_clock_error = None
            break
        except ValueError as exc:
            schedule_clock_error = exc
            if schedule_retry < 2:
                time.sleep(2**schedule_retry)
    if schedule_clock_error is not None:
        raise schedule_clock_error

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
    recruiting_release = get_json(base_url, f"/api/basketball/research/recruiting?season=2027&publication_check={probe_key}")
    release_coverage, recruiting_reviewed_age = validate_reviewed_recruiting_release(
        recruiting_release, checked_at, max_age_hours
    )
    # Older monitor fixtures and releases may omit the optional people array;
    # coverage validation above remains authoritative for the reviewed school
    # evidence, while a missing array contributes zero to the convenience
    # count instead of masking a later archive check.
    reviewed_people = recruiting_release.get("people")
    if not isinstance(reviewed_people, list):
        reviewed_people = []
    prospect_counts = {}
    prospect_destination_counts = {}
    prospect_rank_ties = {}
    prospect_ages = {}
    for prospect_season in (2025, 2026, 2027, 2028, 2029, 2030):
        # The rankings endpoint runs several bounded D1 reads over a large
        # archive. A transient 5-second database timeout is represented as a
        # deliberate 200/source-unavailable payload; retry that semantic
        # response with a fresh cache key before failing the publication audit.
        recruiting_rankings = {}
        ranking_path = f"/api/basketball/research/recruiting-rankings?season={prospect_season}&page=0&publication_check={probe_key}"
        for retry in range(3):
            path = ranking_path if retry == 0 else f"/api/basketball/research/recruiting-rankings?season={prospect_season}&page=0&publication_check={probe_key}{retry}"
            recruiting_rankings = get_json(base_url, path)
            if isinstance(recruiting_rankings.get("rank_quality"), dict):
                break
            if retry < 2:
                time.sleep(2**retry)
        prospect_total = recruiting_rankings.get("total")
        prospect_rows = recruiting_rankings.get("rows")
        commitment_destinations = recruiting_rankings.get("commitment_destinations")
        rank_quality = recruiting_rankings.get("rank_quality")
        prospect_captured = recruiting_rankings.get("captured_at")
        validate_recruiting_destinations(commitment_destinations)
        tied_rank_values, tied_rows = validate_recruiting_rank_quality(rank_quality, prospect_total)
        if (
            recruiting_rankings.get("season") != prospect_season
            or not isinstance(prospect_total, int)
            or prospect_total <= 0
            or not isinstance(prospect_rows, list)
            or not prospect_rows
            or not isinstance(prospect_captured, str)
        ):
            raise ValueError(f"Recruiting rankings release {prospect_season} is malformed or empty")
        prospect_age = (checked_at - timestamp(prospect_captured)).total_seconds() / 3600
        if prospect_age < -24 or prospect_age > max_age_hours:
            raise ValueError(f"Recruiting rankings release {prospect_season} is {max(prospect_age, 0):.1f} hours old")
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
    basketball_markets = get_json(base_url, f"/api/research/markets?meta=1&sport=basketball&publication_check={probe_key}")
    basketball_market_total, basketball_market_pregame, basketball_market_capabilities, basketball_market_receipts = market_metadata(
        basketball_markets, "basketball"
    )
    football_markets = get_json(base_url, f"/api/research/markets?meta=1&sport=football&publication_check={probe_key}")
    football_market_total, football_market_pregame, football_market_capabilities, football_market_receipts = market_metadata(
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
        "forecast_upcoming_rows": upcoming_forecast_rows,
        "forecast_roster_scenario_rows": roster_scenario_rows,
        "forecast_prediction_estimate_type": forecast_prediction["estimate_type"],
        "forecast_prediction_pace": forecast_prediction["pace"],
        "forecast_matchup_factor_integrity": forecast_matchup_context["integrity"],
        "forecast_matchup_factor_source": forecast_matchup_context["source"],
        "forecast_matchup_factor_model": forecast_matchup_context["model_id"],
        "forecast_matchup_factor_same_edition": forecast_matchup_context["same_edition"],
        "womens_forecast_model": womens_forecast["model_id"],
        "womens_forecast_rows": womens_forecast["forecast_rows"],
        "womens_forecast_validation_games": womens_forecast["validation_games"],
        "womens_forecast_calibration_games": womens_forecast["calibration_games"],
        "womens_lower_division_receipts": womens_lower_division["receipt_count"],
        "womens_d2_individual_rows": womens_lower_division["d2"]["individual_rows"],
        "womens_d2_team_rows": womens_lower_division["d2"]["team_rows"],
        "womens_d3_individual_rows": womens_lower_division["d3"]["individual_rows"],
        "womens_d3_team_rows": womens_lower_division["d3"]["team_rows"],
        "womens_lower_schedule_season": womens_lower_schedule["season_year"],
        "womens_lower_schedule_receipts": womens_lower_schedule["receipt_count"],
        "womens_d2_schedule_contests": womens_lower_schedule["d2_contests"],
        "womens_d3_schedule_contests": womens_lower_schedule["d3_contests"],
        "womens_d2_rating_games": womens_lower_ratings["d2"]["valid_final_games"],
        "womens_d2_rating_teams": womens_lower_ratings["d2"]["teams"],
        "womens_d2_rating_model": womens_lower_ratings["d2"]["model_id"],
        "womens_d3_rating_games": womens_lower_ratings["d3"]["valid_final_games"],
        "womens_d3_rating_teams": womens_lower_ratings["d3"]["teams"],
        "womens_d3_rating_model": womens_lower_ratings["d3"]["model_id"],
        "womens_lower_target_probe_contests": womens_lower_target_probe["contests"],
        "womens_lower_target_probe_calendar_days": womens_lower_target_probe["calendar_days"],
        "womens_lower_target_probe_receipts": womens_lower_target_probe["receipt_count"],
        "mens_lower_schedule_season": mens_lower_schedule["season_year"],
        "mens_lower_schedule_receipts": mens_lower_schedule["receipt_count"],
        "mens_d2_schedule_contests": mens_lower_schedule["d2_contests"],
        "mens_d3_schedule_contests": mens_lower_schedule["d3_contests"],
        "mens_d2_rating_games": mens_lower_ratings["d2"]["valid_final_games"],
        "mens_d2_rating_teams": mens_lower_ratings["d2"]["teams"],
        "mens_d2_rating_model": mens_lower_ratings["d2"]["model_id"],
        "mens_d3_rating_games": mens_lower_ratings["d3"]["valid_final_games"],
        "mens_d3_rating_teams": mens_lower_ratings["d3"]["teams"],
        "mens_d3_rating_model": mens_lower_ratings["d3"]["model_id"],
        "mens_lower_target_probe_contests": mens_lower_target_probe["contests"],
        "mens_lower_target_probe_calendar_days": mens_lower_target_probe["calendar_days"],
        "mens_lower_target_probe_receipts": mens_lower_target_probe["receipt_count"],
        "matchup_personnel_game_id": game_id,
        "matchup_personnel_listed_players": matchup_personnel_summary["listed_players"],
        "matchup_personnel_players_with_prior_minutes": matchup_personnel_summary["players_with_prior_minutes"],
        "matchup_personnel_players_with_stats": matchup_personnel_summary["players_with_publisher_stats"],
        "matchup_personnel_players_with_box_bpm": matchup_personnel_summary["players_with_box_bpm"],
        "matchup_personnel_source_receipts": matchup_personnel_summary["source_receipts"],
        "matchup_personnel_source_max_age_hours": round(max(matchup_personnel_summary["source_max_age_hours"], 0), 2),
        "forecast_age_hours": round(max(model_age, 0), 2),
        "scorecard_excluded_rows": scorecard.get("total", 0),
        "football_forecast_model": football_model_id,
        "football_forecast_rows": football_latest["forecasts"],
        "football_scorecard_rows": football_scorecard_rows,
        "football_scorecard_comparisons": football_scorecard_comparisons,
        "football_forecast_age_hours": round(max(football_model_age, 0), 2),
        "football_personnel_readiness_games": football_personnel_readiness["forecast_games"],
        "football_personnel_readiness_complete_games": football_personnel_readiness["complete_games"],
        "football_personnel_readiness_partial_games": football_personnel_readiness["partial_games"],
        "football_personnel_readiness_conflict_games": football_personnel_readiness["conflict_games"],
        "football_personnel_readiness_age_hours": round(football_personnel_readiness_age, 2),
        "schedule_clock_observed_games": schedule_clock_total,
        "schedule_clock_confirmed_games": schedule_clock_confirmed,
        "schedule_clock_latest_age_hours": None if schedule_clock_age is None else round(schedule_clock_age, 2),
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
        "recruiting_rows": len(reviewed_people),
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
        "basketball_market_receipts": basketball_market_receipts,
        "football_market_observations": football_market_total,
        "football_market_pregame": football_market_pregame,
        "football_market_capabilities": football_market_capabilities,
        "football_market_receipts": football_market_receipts,
        "brief_archive_total": brief_archive_total,
        "brief_archive_page_rows": brief_archive_page,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://bball.silvermine.dev")
    parser.add_argument("--max-age-hours", type=float, default=DAILY_PUBLICATION_MAX_AGE_HOURS)
    args = parser.parse_args()
    try:
        report = check_live(args.base_url, max_age_hours=args.max_age_hours)
    except (RuntimeError, ValueError) as exc:
        raise SystemExit(str(exc)) from None
    print(json.dumps(report, indent=2))
