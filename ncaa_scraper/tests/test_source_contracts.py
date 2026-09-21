import json
from pathlib import Path

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


def test_football_discovery_includes_publisher_scope_evidence_and_join_audit():
    result = discover_lower_division_sources("MFB", 3, season=2026)
    candidates = {candidate["dataset"]: candidate for candidate in result["candidates"]}
    ncaa = candidates["ncaa_player_stats"]
    assert ncaa["source_evidence"]["scope_claim"] == ["fbs", "fcs"]
    assert "raw.capture_fbs" in ncaa["source_evidence"]["scope_basis"]
    assert any(
        blocker["code"] == "publisher_scope_excludes_target_division"
        for blocker in ncaa["blockers"]
    )

    box = candidates["box"]
    team_scope = box["observation"]["team_scope"]
    assert set(("d2", "d3")).issubset(team_scope["observed_divisions"])
    assert team_scope["player_rows_by_division"].get("d3", 0) == 0
    assert team_scope["team_rows_by_division"]["d3"] == 238
    assert team_scope["player_athletes_by_division"].get("d3", 0) == 0
    assert any(
        blocker["code"] == "target_division_player_rows_absent"
        for blocker in box["blockers"]
    )


def test_football_discovery_records_public_player_endpoint_contracts_without_importing_rows():
    result = discover_lower_division_sources("MFB", 2, season=2026)
    contracts = {item["key"]: item for item in result["public_endpoint_contracts"]}

    ncaa = contracts["ncaa_mfb_national_ranking"]
    assert "academic_year=2026" in ncaa["url"]
    assert "division=2" in ncaa["url"]
    assert ncaa["discovery_status"] == "candidate_unverified"
    assert "robots-permitted capture" in ncaa["required_before_import"]

    espn = contracts["espn_mfb_group_35_event_summary"]
    assert "summary?event={event_id}" in espn["url"]
    assert "groups=35" in espn["discovery_url"]
    assert "combined D2/D3" in espn["scope"]
    assert any("exact D2/D3 team classification" in value for value in espn["required_before_import"])
    # Endpoint discovery is evidence for the next intake step, never a player
    # archive.  The source candidates above must not change the blocked status.
    assert result["status"] == "blocked"


def test_lower_football_readiness_publishes_exact_join_counts_without_player_rows():
    artifact = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "football" / "lower-division-player-readiness.json"
    payload = json.loads(artifact.read_text(encoding="utf-8"))
    assert payload["status"] == "blocked"
    assert payload["divisions"]["2"]["source_labeled_team_rows"] == 167
    assert payload["divisions"]["3"]["source_labeled_team_rows"] == 238
    for division in ("2", "3"):
        row = payload["divisions"][division]
        assert row["box_rows_mapped_to_source_labeled_teams"] == 0
        assert row["unique_athletes_mapped_to_source_labeled_teams"] == 0
        assert row["rows_published"] == 0


def test_mbb_discovery_accepts_receipted_explicit_d2_and_d3_rows():
    for division, expected in ((2, 1020), (3, 1031)):
        result = discover_lower_division_sources("MBB", division, season=2026)
        assert result["status"] == "ready"
        candidate = result["candidates"][0]
        assert candidate["dataset"] == "ncaa_individual"
        assert candidate["observation"]["division_rows"][str(division)] == expected
        assert candidate["observation"]["identity_complete"][str(division)] == expected
        assert candidate["observation"]["receipt_valid"] is True
        assert candidate["blockers"] == []

    try:
        discover_lower_division_sources("WBB", 1)
    except ValueError as error:
        assert "division 2 or 3" in str(error)
    else:
        raise AssertionError("D1 should not use the lower-division contract")
