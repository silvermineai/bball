from ncaa_scraper.source_contracts import (
    discover_lower_division_sources,
    validate_player_source_rows,
)


def test_labeled_release_contract_accepts_only_explicit_scope_and_receipt():
    row = {
        "sport": "basketball",
        "gender": "women",
        "division": 2,
        "season": 2026,
        "team_id": "team-2",
        "team_display_name": "Example State",
        "athlete_id": "athlete-2",
        "athlete_display_name": "Example Player",
    }
    result = validate_player_source_rows(
        [row],
        {"url": "https://example.test/wbb.parquet", "sha256": "a" * 64},
        sport="basketball",
        gender="women",
        division=2,
    )
    assert result["accepted"] is True
    assert result["status"] == "ready"


def test_missing_division_and_receipt_block_import_without_reclassification():
    row = {
        "sport": "basketball",
        "gender": "women",
        "season": 2026,
        "team_id": "team-2",
        "team_display_name": "Example State",
        "athlete_id": "athlete-2",
        "athlete_display_name": "Example Player",
    }
    result = validate_player_source_rows(
        [row],
        None,
        sport="basketball",
        gender="women",
        division=2,
    )
    assert result["accepted"] is False
    assert {error["code"] for error in result["errors"]} == {
        "invalid_receipt",
        "missing_or_invalid_division",
    }


def test_wbb_discovery_reports_missing_division_for_each_player_asset():
    result = discover_lower_division_sources("WBB", 3)
    assert result["status"] == "blocked"
    assert result["requested_scope"]["gender"] == "women"
    assert [candidate["dataset"] for candidate in result["candidates"]] == [
        "player_season",
        "player_box",
    ]
    assert all(
        "missing_division" in {blocker["code"] for blocker in candidate["blockers"]}
        for candidate in result["candidates"]
    )
    assert "school names" in result["classification_policy"]


def test_football_discovery_surfaces_fbs_only_and_unstable_ncaa_identity():
    result = discover_lower_division_sources("MFB", 2, season=2026)
    candidates = {candidate["dataset"]: candidate for candidate in result["candidates"]}
    assert result["status"] == "blocked"
    assert candidates["passing"]["observation"]["observed_divisions"] == ["fbs"]
    assert any(blocker["code"] == "target_division_absent" for blocker in candidates["passing"]["blockers"])
    assert any(blocker["code"] == "missing_athlete_id" for blocker in candidates["ncaa_player_stats"]["blockers"])
    assert any(blocker["code"] == "missing_division" for blocker in candidates["box"]["blockers"])


def test_discovery_rejects_unsupported_sport_or_division():
    try:
        discover_lower_division_sources("MBB", 2)
    except ValueError as error:
        assert "catalog" in str(error)
    else:
        raise AssertionError("MBB lower-division player catalog should not be silently substituted")

    try:
        discover_lower_division_sources("WBB", 1)
    except ValueError as error:
        assert "division 2 or 3" in str(error)
    else:
        raise AssertionError("D1 should not use the lower-division contract")
