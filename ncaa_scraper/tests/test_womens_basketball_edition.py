import importlib.util
from pathlib import Path

import pytest


_SCRIPT = Path(__file__).resolve().parents[2] / "scripts/publish-womens-basketball-edition.py"
_SPEC = importlib.util.spec_from_file_location("womens_edition", _SCRIPT)
_MODULE = importlib.util.module_from_spec(_SPEC)
assert _SPEC and _SPEC.loader
_SPEC.loader.exec_module(_MODULE)
build_team_stats = _MODULE.build_team_stats
build_player_box_stats = _MODULE.build_player_box_stats
source_field_coverage = _MODULE.source_field_coverage


def test_player_box_stats_keep_played_rows_and_exclude_dnp_from_aggregates():
    rows = [
        {
            "athlete_id": "7",
            "athlete_display_name": "Example Guard",
            "athlete_position_abbreviation": "G",
            "team_id": "11",
            "team_display_name": "Example Eagles",
            "game_id": "g1",
            "points": "10",
            "minutes": "20",
            "field_goals_made": "4",
            "field_goals_attempted": "8",
            "three_point_field_goals_made": "2",
            "three_point_field_goals_attempted": "4",
            "free_throws_made": "0",
            "free_throws_attempted": "0",
            "starter": "true",
            "did_not_play": "false",
        },
        {
            "athlete_id": "7",
            "athlete_display_name": "Example Guard",
            "athlete_position_abbreviation": "G",
            "team_id": "11",
            "team_display_name": "Example Eagles",
            "game_id": "g2",
            "points": "6",
            "minutes": "10",
            "field_goals_made": "2",
            "field_goals_attempted": "5",
            "three_point_field_goals_made": "0",
            "three_point_field_goals_attempted": "1",
            "free_throws_made": "2",
            "free_throws_attempted": "2",
            "starter": "false",
            "did_not_play": "false",
        },
        {
            "athlete_id": "7",
            "athlete_display_name": "Example Guard",
            "athlete_position_abbreviation": "G",
            "team_id": "11",
            "team_display_name": "Example Eagles",
            "game_id": "g3",
            "points": "",
            "starter": "false",
            "did_not_play": "true",
        },
    ]

    players, coverage = build_player_box_stats(rows)

    assert {key: value for key, value in coverage.items() if key != "source_fields"} == {
        "rows": 3,
        "players": 1,
        "games": 3,
        "played_rows": 2,
        "dnp_rows": 1,
        "skipped_rows": 0,
        "teams": 1,
        "players_multiple_teams": 0,
    }
    player = players[0]
    assert player["games_played"] == 2
    assert player["dnp_rows"] == 1
    assert player["starts"] == 1
    assert player["totals"]["points"] == 16.0
    assert player["per_game"]["points"] == 8.0
    assert player["shooting"] == {
        "field_goal_pct": 46.1538,
        "three_point_pct": 40.0,
        "free_throw_pct": 100.0,
    }
    fields = {item["field"]: item for item in coverage["source_fields"]}
    assert fields["points"]["observed_rows"] == 2
    assert fields["points"]["finite_numeric_rows"] == 2
    assert fields["did_not_play"]["observed_rows"] == 3


def test_source_field_coverage_keeps_missingness_and_numeric_quality_separate():
    coverage = source_field_coverage([
        {"points": "12", "starter": "true", "future_text": "x"},
        {"points": "", "starter": "false", "future_text": None},
        {"points": "not-published", "starter": None, "future_text": "y"},
    ])
    by_field = {item["field"]: item for item in coverage}
    assert by_field["points"] == {"field": "points", "observed_rows": 2, "finite_numeric_rows": 1}
    assert by_field["starter"] == {"field": "starter", "observed_rows": 2, "finite_numeric_rows": 0}
    assert by_field["future_text"] == {"field": "future_text", "observed_rows": 2, "finite_numeric_rows": 0}


def test_team_stats_preserve_all_numeric_source_fields_and_receipt_shape():
    teams, coverage = build_team_stats([
        {
            "team_id": "1",
            "team_display_name": "Example Eagles",
            "team_abbreviation": "EX",
            "stat_name": "avgPoints",
            "stat_label": "PPG",
            "stat_display_name": "Points Per Game",
            "stat_description": "Average points per game.",
            "value": "72.125",
        },
        {
            "team_id": "1",
            "team_display_name": "Example Eagles",
            "team_abbreviation": "EX",
            "stat_name": "gamesPlayed",
            "stat_label": "GP",
            "stat_display_name": "Games Played",
            "stat_description": "Games played.",
            "value": "20",
        },
        {"team_id": "", "stat_name": "avgPoints", "value": "99"},
        {"team_id": "1", "stat_name": "missing", "value": "not-a-number"},
    ])

    assert coverage == {
        "rows": 4,
        "numeric_rows": 2,
        "skipped_rows": 2,
        "teams": 1,
        "stat_fields": 2,
    }
    assert teams[0]["stats"] == {"avgPoints": 72.125, "gamesPlayed": 20.0}
    assert teams[0]["stat_metadata"]["avgPoints"]["name"] == "Points Per Game"


def test_team_stats_fail_closed_on_conflicting_duplicate_source_rows():
    row = {"team_id": "1", "team_display_name": "Example", "stat_name": "avgPoints", "value": "70"}
    with pytest.raises(ValueError, match="Conflicting team stat"):
        build_team_stats([row, {**row, "value": "71"}])


def test_player_box_stats_preserve_multi_team_identity_context():
    rows = [
        {
            "athlete_id": "7",
            "athlete_display_name": "Transfer Guard",
            "team_id": "11",
            "team_display_name": "First Eagles",
            "game_id": "g1",
            "points": "10",
            "did_not_play": "false",
        },
        {
            "athlete_id": "7",
            "athlete_display_name": "Transfer Guard",
            "team_id": "22",
            "team_display_name": "Second Hawks",
            "game_id": "g2",
            "points": "8",
            "did_not_play": "false",
        },
    ]

    players, coverage = build_player_box_stats(rows)

    assert coverage["players_multiple_teams"] == 1
    assert players[0]["team"] == "Multiple teams"
    assert players[0]["team_id"] == ""
    assert players[0]["teams"] == [
        {"team_id": "11", "team": "First Eagles"},
        {"team_id": "22", "team": "Second Hawks"},
    ]
    assert players[0]["totals"]["points"] == 18.0
