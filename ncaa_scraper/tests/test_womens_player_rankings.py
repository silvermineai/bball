from ncaa_scraper.womens_player_rankings import build_rankings


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
