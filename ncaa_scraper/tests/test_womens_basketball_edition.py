import importlib.util
from pathlib import Path

import pytest


_SCRIPT = Path(__file__).resolve().parents[2] / "scripts/publish-womens-basketball-edition.py"
_SPEC = importlib.util.spec_from_file_location("womens_edition", _SCRIPT)
_MODULE = importlib.util.module_from_spec(_SPEC)
assert _SPEC and _SPEC.loader
_SPEC.loader.exec_module(_MODULE)
build_team_stats = _MODULE.build_team_stats


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
