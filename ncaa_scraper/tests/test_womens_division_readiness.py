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
