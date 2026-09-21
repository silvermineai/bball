import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/build-womens-basketball-division-readiness.py"
SPEC = importlib.util.spec_from_file_location("womens_division_readiness", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_non_d1_signal_is_audited_without_becoming_d2_or_d3_rows():
    result = MODULE.build_readiness(
        {
            "generated_at": "2026-09-20T00:00:00Z",
            "observed_player_season": 2026,
            "season": 2027,
            "coverage": {"players": 1000, "team_stats_teams": 572, "upcoming_games": 25},
            "receipts": {"schedule": {"sha256": "abc"}},
        },
        [
            {"game_id": 1, "date": "2026-11-01", "home_display_name": "D1", "away_display_name": "Unresolved", "away_non_div1_team": True},
            {"game_id": 2, "date": "2026-11-02", "home_display_name": "D1", "away_display_name": "D1", "away_non_div1_team": None},
        ],
    )
    assert result["published"] == {"division": "1", "status": "published", "player_rows": 1000, "team_rows": 572, "upcoming_games": 25}
    assert result["divisions"]["2"]["rows"] == 0
    assert result["divisions"]["3"]["rows"] == 0
    assert result["non_division_one_schedule_signals"]["rows"] == 1
    assert result["non_division_one_schedule_signals"]["classification"] == "unresolved_non_d1"
    assert "division" in result["import_contract"]["required_scope_fields"]


def test_missing_division_never_defaults_to_d2_or_d3():
    result = MODULE.build_readiness({"coverage": {}}, [{"game_id": 1, "away_non_div1_team": True}])
    assert {key: value["rows"] for key, value in result["divisions"].items()} == {"2": 0, "3": 0}
    assert result["non_division_one_schedule_signals"]["games"][0]["source_flag"] == "away_non_div1_team"


def test_asset_audit_records_missing_labels_without_reclassifying_signals():
    result = MODULE.build_readiness(
        {"coverage": {}},
        [],
        [
            {
                "asset": "schedule_2027.parquet",
                "rows": 10,
                "division_fields": [],
                "receipt": {"valid": True},
            },
            {
                "asset": "player_2026.parquet",
                "rows": 20,
                "division_fields": [],
                "receipt": {"valid": True},
            },
        ],
    )
    assert result["asset_audit"] == {
        "status": "blocked_by_missing_explicit_division_labels",
        "assets_inspected": 2,
        "assets_with_explicit_division": 0,
        "assets_with_valid_receipt": 2,
        "explicit_division_fields": [],
        "method": "Parquet schemas and immutable receipt sidecars were inspected; school names, conferences, and non-D1 flags are not classifiers.",
    }
    assert result["divisions"]["2"]["rows"] == result["divisions"]["3"]["rows"] == 0


def test_source_contract_exposes_auditable_candidate_without_publishing_rows():
    result = MODULE.build_readiness({"coverage": {}}, [], [])
    contracts = {item["key"]: item for item in result["source_contracts"]}
    assert contracts["sportsdataverse_wbb_bulk"]["status"] == "blocked"
    assert contracts["sportsdataverse_wbb_bulk"]["evidence"]["assets_with_explicit_division"] == 0
    assert contracts["ncaa_wbb_national_rankings"]["status"] == "blocked"
    assert contracts["ncaa_wbb_national_rankings"]["evidence"] == {
        "capture_present": False,
        "rows_published": 0,
        "receipt_verified": False,
        "robots_allowed": False,
    }
    assert contracts["ncaa_wbb_national_rankings"]["robots_policy"]["status"] == "disallowed"
    schedule = contracts["ncaa_com_wbb_lower_division_schedule"]
    assert schedule["status"] == "candidate_unverified"
    assert schedule["evidence"] == {
        "api_contract_validated": True,
        "target_season_rows": 0,
        "target_season_receipt_verified": False,
        "explicit_division_request": True,
    }
    assert schedule["query_contract"]["calendar"]["required_variables"] == [
        "sportCode=WBB", "seasonYear", "division=2|3", "month=1..12"
    ]
    assert result["divisions"]["2"]["rows"] == result["divisions"]["3"]["rows"] == 0


def test_next_input_contract_accepts_explicit_scope_and_rejects_conflicts():
    receipt = {"url": "https://example.test/release.parquet", "sha256": "a" * 64}
    row = {
        "sport": "basketball",
        "gender": "women",
        "division": 2,
        "season": 2026,
        "team_id": "team-1",
        "team_display_name": "Example",
        "athlete_id": "athlete-1",
        "athlete_display_name": "Player",
        "stat_label": "PPG",
        "value": 18.4,
    }
    assert MODULE.validate_labeled_release([row], receipt)["accepted"] is True
    bad = {**row, "value": 19.1}
    rejected = MODULE.validate_labeled_release([row, bad], receipt)
    assert rejected["accepted"] is False
    assert {error["code"] for error in rejected["errors"]} == {"conflicting_duplicate"}
    missing = MODULE.validate_labeled_release([{**row, "division": None}], receipt)
    assert missing["accepted"] is False
    assert "missing_or_invalid_division" in {error["code"] for error in missing["errors"]}


def test_ncaa_com_lower_division_tables_are_source_native_without_identity_join():
    result = MODULE.build_readiness(
        {"coverage": {}},
        [],
        [],
        {
            "divisions": {
                "d2": {
                    "individual": [{"rows": [{"rank": 1}, {"rank": 2}]}],
                    "team": [{"rows": [{"rank": 1}]}],
                    "identity_status": "source_names_and_team_slugs_only",
                    "through_games": "Saturday, March 28, 2026",
                },
                "d3": {"individual": [], "team": [], "identity_status": "source_names_and_team_slugs_only"},
            },
            "receipts": [{"url": "https://www.ncaa.com/stats/basketball-women/d2", "sha256": "a" * 64}],
        },
    )
    d2 = result["divisions"]["2"]["source_native_leaderboards"]
    assert d2["individual_rows"] == 2
    assert d2["team_rows"] == 1
    assert d2["identity_status"] == "source_names_and_team_slugs_only"
    contract = {item["key"]: item for item in result["source_contracts"]}["ncaa_com_wbb_lower_division_stats"]
    assert contract["status"] == "ready"
    assert contract["evidence"] == {"capture_present": True, "rows_published": 3, "receipt_verified": True}
    assert result["divisions"]["2"]["rows"] == 0
