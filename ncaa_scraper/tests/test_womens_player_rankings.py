import pytest

from ncaa_scraper.womens_player_rankings import build_box_rankings, build_rankings


def player(player_id, name, games, **stats):
    return {"player_id": player_id, "name": name, "team": "Team", "stats": {"gamesPlayed": games, **stats}}


def test_rankings_keep_lenses_separate_and_qualify_by_games():
    result = build_rankings([
        player("a", "Alpha", 20, avgPoints=20, avgAssists=2),
        player("b", "Beta", 9, avgPoints=30, avgAssists=8),
        player("c", "Charlie", 20, avgPoints=15, avgAssists=7),
    ])
    assert [row["name"] for row in result["leaderboards"]["scoring"]["rows"]] == ["Alpha", "Charlie"]
    assert [row["name"] for row in result["leaderboards"]["playmaking"]["rows"]] == ["Charlie", "Alpha"]
    assert result["coverage"]["scoring"] == {"observed": 3, "qualified": 2}


def test_rankings_leave_missing_values_out_of_only_their_lens():
    result = build_rankings([player("a", "Alpha", 20, avgPoints=20), player("b", "Beta", 20)])
    assert result["coverage"]["scoring"] == {"observed": 1, "qualified": 1}
    assert result["coverage"]["rebounding"] == {"observed": 0, "qualified": 0}


def test_qualification_metadata_keeps_source_games_denominator_explicit():
    result = build_rankings([player("a", "Alpha", 20, avgPoints=20)])

    assert result["qualification"] == {
        "field": "gamesPlayed",
        "minimum": 10,
        "scope": "source-reported player-season field",
        "schedule_reconciled": False,
    }
    assert result["leaderboards"]["scoring"]["rows"][0]["games"] == 20


def test_scoring_volume_uses_publisher_total_and_keeps_games_context():
    result = build_rankings([
        player("short", "Short sample", 10, avgPoints=30, points=300),
        player("durable", "Durable scorer", 20, avgPoints=20, points=400),
    ])
    board = result["leaderboards"]["scoring_volume"]
    assert [row["name"] for row in board["rows"]] == ["Durable scorer", "Short sample"]
    assert board["rows"][0]["value"] == 400
    assert board["rows"][0]["games"] == 20
    assert "season points total" in board["description"]
    assert result["coverage"]["scoring_volume"] == {"observed": 2, "qualified": 2}


def box_player(player_id, name, games, *, points, rebounds=0, assists=0, fga=0, fgm=0):
    return {
        "player_id": player_id,
        "name": name,
        "team": "Team",
        "team_id": "1",
        "position": "G",
        "games_played": games,
        "box_rows": games,
        "per_game": {"points": points, "rebounds": rebounds, "assists": assists},
        "totals": {"points": points * games},
        "shooting": {
            "field_goal_pct": 100 * fgm / fga if fga else None,
            "three_point_pct": None,
            "free_throw_pct": None,
        },
    }


def test_box_rankings_expand_cohort_and_keep_box_evidence():
    result = build_box_rankings([
        box_player("a", "Alpha", 20, points=20, rebounds=5, assists=2, fga=10, fgm=5),
        box_player("b", "Beta", 9, points=30, rebounds=8, assists=8, fga=10, fgm=5),
        box_player("c", "Charlie", 20, points=15, rebounds=7, assists=6, fga=10, fgm=6),
    ])

    assert [row["name"] for row in result["leaderboards"]["scoring"]["rows"]] == ["Alpha", "Charlie"]
    assert [row["name"] for row in result["leaderboards"]["playmaking"]["rows"]] == ["Charlie", "Alpha"]
    assert result["leaderboards"]["scoring"]["rows"][0]["box_rows"] == 20
    assert result["coverage"]["scoring"] == {"observed": 3, "qualified": 2}
    assert result["qualification"]["dnp_excluded"] is True


def test_box_rankings_reject_invalid_game_threshold():
    with pytest.raises(ValueError, match="positive integer"):
        build_box_rankings([], min_games=0)
