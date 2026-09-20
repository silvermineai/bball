import hashlib
import json

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
    ]


def test_wbb_readiness_requires_receipt_hashes_before_fit(tmp_path):
    for dataset in ("schedule", "team_box"):
        template = "wbb_schedule_{season}.parquet" if dataset == "schedule" else "team_box_{season}.parquet"
        for season in (2023, 2024, 2025, 2026):
            retain_asset(tmp_path, dataset, season, template.format(season=season))
    retain_asset(tmp_path, "schedule", 2027, "wbb_schedule_2027.parquet")

    result = assess(tmp_path)
    assert result["status"] == "ready_for_fit"
    assert result["missing_inputs"] == []
    assert result["checks"][-1]["status"] == "ready"
    assert release_url("team_box", 2026).endswith(
        "/espn_womens_college_basketball_team_boxscores/team_box_2026.parquet"
    )
