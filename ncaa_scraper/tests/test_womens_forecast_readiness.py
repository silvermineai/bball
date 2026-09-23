import hashlib
import json

import pyarrow as pa
import pyarrow.parquet as pq

from ncaa_scraper.womens_forecast_readiness import assess, release_url


def retain_asset(cache, dataset, season, filename):
    path = cache / filename
    payload = f"{dataset}-{season}".encode()
    path.write_bytes(payload)
    (cache / f"{filename}.receipt.json").write_text(
        json.dumps({"sha256": hashlib.sha256(payload).hexdigest()})
    )


def test_wbb_readiness_lists_exact_missing_history_without_model_fallback(tmp_path):
    result = assess(tmp_path)

    assert result["status"] == "blocked"
    assert result["model_id"] is None
    assert result["forecast_rows"] == 0
    assert "Men’s coefficients" in result["model_boundary"]
    assert [(row["dataset"], row["season"]) for row in result["missing_inputs"]] == [
        ("schedule", 2023),
        ("schedule", 2024),
        ("schedule", 2025),
        ("schedule", 2026),
        ("team_box", 2023),
        ("team_box", 2024),
        ("team_box", 2025),
        ("team_box", 2026),
        ("model_calibration", 2026),
    ]


def test_wbb_readiness_requires_receipt_hashes_before_fit(tmp_path):
    for season in (2023, 2024, 2025, 2026):
        retain_asset(tmp_path, "team_box", season, f"team_box_{season}.parquet")
        retain_asset(tmp_path, "schedule", season, f"wbb_schedule_{season}.parquet")
    retain_asset(tmp_path, "schedule", 2027, "wbb_schedule_2027.parquet")

    forecast = tmp_path / "forecast.json"
    forecast.write_text(json.dumps({
        "sport": "basketball",
        "gender": "women",
        "target_season": 2027,
        "model_status": "published",
        "model_id": "womens-basketball-test",
        "validation": {"games": 100, "interval_games": 100, "interval_coverage": 0.8},
        "calibration": {
            "games": 100,
            "logistic_coefficients": [0.0, 0.1],
            "brier": 0.2,
            "log_loss": 0.6,
            "margin_half_width": 20.0,
        },
        "forecasts": [{"game_id": "g1", "date": "2026-11-01T00:00:00Z", "home_id": "home", "away_id": "away", "prediction": {}}],
    }))
    result = assess(tmp_path, forecast_path=forecast)
    assert result["status"] == "published"
    assert result["missing_inputs"] == []
    assert result["model_id"] == "womens-basketball-test"
    assert result["forecast_rows"] == 1
    assert result["checks"][-1]["status"] == "ready"
    assert release_url("team_box", 2026).endswith(
        "/espn_womens_college_basketball_team_boxscores/team_box_2026.parquet"
    )


def test_wbb_readiness_rejects_wrong_forecast_scope_even_when_inputs_are_ready(tmp_path):
    for season in (2023, 2024, 2025, 2026):
        retain_asset(tmp_path, "team_box", season, f"team_box_{season}.parquet")
        retain_asset(tmp_path, "schedule", season, f"wbb_schedule_{season}.parquet")
    retain_asset(tmp_path, "schedule", 2027, "wbb_schedule_2027.parquet")

    forecast = tmp_path / "forecast.json"
    forecast.write_text(json.dumps({
        "sport": "basketball",
        "gender": "men",
        "target_season": 2027,
        "model_status": "published",
        "model_id": "womens-basketball-test",
        "validation": {"games": 100, "interval_games": 100, "interval_coverage": 0.8},
        "calibration": {
            "games": 100,
            "logistic_coefficients": [0.0, 0.1],
            "brier": 0.2,
            "log_loss": 0.6,
            "margin_half_width": 20.0,
        },
        "forecasts": [{"game_id": "g1", "date": "2026-11-01T00:00:00Z", "home_id": "home", "away_id": "away", "prediction": {}}],
    }))
    result = assess(tmp_path, forecast_path=forecast)
    assert result["status"] == "ready_for_fit"
    assert result["model_id"] is None
    assert result["checks"][-1]["key"] == "published_forecast_contract"
    assert result["checks"][-1]["status"] == "blocked"


def test_wbb_readiness_keeps_fit_ready_distinct_from_published(tmp_path):
    for season in (2023, 2024, 2025, 2026):
        retain_asset(tmp_path, "team_box", season, f"team_box_{season}.parquet")
        retain_asset(tmp_path, "schedule", season, f"wbb_schedule_{season}.parquet")
    retain_asset(tmp_path, "schedule", 2027, "wbb_schedule_2027.parquet")

    fit_metadata = tmp_path / "fit-metadata.json"
    fit_metadata.write_text(json.dumps({
        "validation": {"games": 100, "interval_games": 100, "interval_coverage": 0.8},
        "calibration": {
            "games": 100,
            "logistic_coefficients": [0.0, 0.1],
            "brier": 0.2,
            "log_loss": 0.6,
            "margin_half_width": 20.0,
        },
        "forecasts": [],
    }))
    result = assess(tmp_path, forecast_path=fit_metadata)

    assert result["status"] == "ready_for_fit"
    assert result["model_id"] is None
    assert result["forecast_rows"] == 0


def _write_target_schedule(path, rows):
    pq.write_table(pa.Table.from_pylist(rows), path)
    receipt = path.with_name(path.name + ".receipt.json")
    receipt.write_text(json.dumps({"sha256": hashlib.sha256(path.read_bytes()).hexdigest()}))


def _ready_assets(tmp_path):
    for season in (2023, 2024, 2025, 2026):
        retain_asset(tmp_path, "team_box", season, f"team_box_{season}.parquet")
        retain_asset(tmp_path, "schedule", season, f"wbb_schedule_{season}.parquet")


def _ready_forecast(path, game_id="g1", home_id="home", away_id="away"):
    path.write_text(json.dumps({
        "sport": "basketball",
        "gender": "women",
        "target_season": 2027,
        "model_status": "published",
        "model_id": "womens-basketball-test",
        "validation": {"games": 100, "interval_games": 100, "interval_coverage": 0.8},
        "calibration": {
            "games": 100,
            "logistic_coefficients": [0.0, 0.1],
            "brier": 0.2,
            "log_loss": 0.6,
            "margin_half_width": 20.0,
        },
        "coverage": {"forecast_rows": 1, "primary_rows": 1, "cold_start_rows": 0, "rated_teams": 2},
        "forecasts": [{"game_id": game_id, "date": "2026-11-01T00:00:00Z", "home_id": home_id, "away_id": away_id, "prediction": {}}],
    }))


def test_wbb_readiness_blocks_forecast_that_does_not_match_retained_target_slate(tmp_path):
    _ready_assets(tmp_path)
    retain_asset(tmp_path, "schedule", 2027, "wbb_schedule_2027.parquet")
    target = tmp_path / "wbb_schedule_2027.parquet"
    _write_target_schedule(target, [{"game_id": "g1", "home_id": "home", "away_id": "away", "status_type_state": "pre"}])
    forecast = tmp_path / "forecast.json"
    _ready_forecast(forecast, game_id="g2")
    result = assess(tmp_path, forecast_path=forecast, target_schedule_path=target)
    alignment = result["target_schedule_alignment"]
    assert result["status"] == "blocked"
    assert result["checks"][-2]["key"] == "target_schedule_alignment"
    assert result["checks"][-2]["status"] == "blocked"
    assert alignment["missing_forecasts"] == 1
    assert alignment["extra_forecasts"] == 1
    assert any(row["dataset"] == "target_schedule_alignment" for row in result["missing_inputs"])


def test_wbb_readiness_accepts_exact_target_slate_reconciliation(tmp_path):
    _ready_assets(tmp_path)
    retain_asset(tmp_path, "schedule", 2027, "wbb_schedule_2027.parquet")
    target = tmp_path / "wbb_schedule_2027.parquet"
    _write_target_schedule(target, [{"game_id": "g1", "home_id": "home", "away_id": "away", "status_type_state": "pre"}])
    forecast = tmp_path / "forecast.json"
    _ready_forecast(forecast)
    result = assess(tmp_path, forecast_path=forecast, target_schedule_path=target)
    assert result["status"] == "published"
    assert result["target_schedule_alignment"]["source_rows"] == 1
    assert result["checks"][-2]["status"] == "ready"
