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
