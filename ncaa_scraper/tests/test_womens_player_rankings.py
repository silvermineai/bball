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


def box_player(
    player_id,
    name,
    games,
    *,
    points,
    rebounds=0,
    assists=0,
    steals=0,
    blocks=0,
    turnovers=0,
    minutes=0,
    fga=0,
    fgm=0,
    tpa=0,
    tpm=0,
    fta=0,
    ftm=0,
):
    return {
        "player_id": player_id,
        "name": name,
        "team": "Team",
        "team_id": "1",
        "position": "G",
        "games_played": games,
        "box_rows": games,
        "per_game": {"points": points, "rebounds": rebounds, "assists": assists},
        "totals": {
            "points": points * games,
            "rebounds": rebounds * games,
            "assists": assists * games,
            "steals": steals,
            "blocks": blocks,
            "turnovers": turnovers,
            "minutes": minutes,
            "field_goals_attempted": fga,
            "field_goals_made": fgm,
            "three_point_field_goals_attempted": tpa,
            "three_point_field_goals_made": tpm,
            "free_throws_attempted": fta,
            "free_throws_made": ftm,
        },
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


def test_box_rankings_add_volume_qualified_efficiency_and_workload_lenses():
    result = build_box_rankings([
        box_player(
            "qualified", "Qualified", 20, points=15, assists=4, turnovers=40,
            minutes=600, fga=200, fgm=100, tpa=80, tpm=30, fta=80, ftm=60,
        ),
        box_player(
            "tiny", "Tiny sample", 20, points=20, assists=5, turnovers=10,
            minutes=300, fga=20, fgm=15, tpa=10, tpm=8, fta=5, ftm=5,
        ),
    ])

    boards = result["leaderboards"]
    assert boards["true_shooting"]["rows"] == [{
        "player_id": "qualified",
        "name": "Qualified",
        "team": "Team",
        "team_id": "1",
        "position": "G",
        "games": 20,
        "value": 63.03,
        "box_rows": 20,
        "sample": 238.0,
        "rank": 1,
    }]
    assert boards["effective_field_goal"]["rows"][0]["value"] == 57.5
    assert boards["points_per_40"]["rows"][0]["value"] == 20.0
    assert boards["assist_turnover"]["rows"][0]["value"] == 2.0
    assert boards["true_shooting"]["min_sample"] == 100
    assert boards["true_shooting"]["sample_unit"] == "FGA + 0.475 × FTA"
    assert result["coverage"]["true_shooting"] == {"observed": 2, "qualified": 1}


def test_box_rankings_add_auditable_shot_mix_and_two_way_rate_lenses():
    result = build_box_rankings([
        box_player(
            "qualified", "Qualified", 20, points=15, rebounds=8, steals=30, blocks=15,
            minutes=600, fga=200, fgm=100, tpa=80, tpm=30, fta=80,
        ),
        box_player(
            "tiny", "Tiny sample", 20, points=10, rebounds=3, steals=5, blocks=2,
            minutes=300, fga=50, fgm=25, tpa=20, tpm=8, fta=10,
        ),
    ])

    boards = result["leaderboards"]
    assert boards["two_point"]["rows"][0]["value"] == 58.33
    assert boards["two_point"]["rows"][0]["sample"] == 120
    assert boards["three_point_rate"]["rows"][0]["value"] == 40
    assert boards["free_throw_rate"]["rows"][0]["value"] == 40
    assert boards["rebounds_per_40"]["rows"][0]["value"] == 10.67
    assert boards["stocks_per_40"]["rows"][0]["value"] == 3
    assert boards["stocks_per_40"]["sample_unit"] == "minutes"
    assert result["coverage"]["two_point"] == {"observed": 2, "qualified": 1}
    assert result["coverage"]["stocks_per_40"] == {"observed": 2, "qualified": 1}


def test_rankings_assign_the_same_rank_to_equal_values():
    season = build_rankings([
        player("b", "Beta", 20, avgPoints=20),
        player("a", "Alpha", 20, avgPoints=20),
        player("c", "Charlie", 20, avgPoints=10),
    ])
    assert [row["rank"] for row in season["leaderboards"]["scoring"]["rows"]] == [1, 1, 3]

    boxes = build_box_rankings([
        box_player("b", "Beta", 20, points=20),
        box_player("a", "Alpha", 20, points=20),
        box_player("c", "Charlie", 20, points=10),
    ])
    assert [row["rank"] for row in boxes["leaderboards"]["scoring"]["rows"]] == [1, 1, 3]
