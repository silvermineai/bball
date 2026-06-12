from pathlib import Path

from ncaa_scraper.parsers import parse_game, parse_individual_stats


FIXTURES = Path(__file__).resolve().parents[1] / "ncaa_scraper" / "cache"


def test_uconn_game_parses_player_stats_and_maps_shots():
    parsed = parse_game(
        (FIXTURES / "game_6422772_box.html").read_text(),
        (FIXTURES / "game_6422772_pbp.html").read_text(),
        6422772,
        (FIXTURES / "game_6422772_individual_stats_scrapling.html").read_text(),
    )

    assert parsed.summary.away_team.name == "BYU Cougars"
    assert parsed.summary.home_team.name == "UConn Huskies"
    assert len(parsed.actions) == 565
    assert len(parsed.shots) == 112
    assert len(parsed.player_stats) == 18
    assert {stat.name for stat in parsed.player_stats} >= {"Alex Karaban", "Tarris Reed Jr.", "Robert Wright III"}
    assert all(shot.ncaa_player_id for shot in parsed.shots)
    assert sum(1 for action in parsed.actions if action.ncaa_player_id) > 500
    karaban_three = next(
        shot for shot in parsed.shots if shot.player_name == "Alex Karaban" and shot.period == 2 and shot.clock == "17:23:00"
    )
    assert karaban_three.is_three is True
    assert karaban_three.shot_value == 3


def test_individual_stats_keeps_canonical_and_internal_player_ids():
    box = (FIXTURES / "game_6422772_box.html").read_text()
    pbp = (FIXTURES / "game_6422772_pbp.html").read_text()
    individual = (FIXTURES / "game_6422772_individual_stats_scrapling.html").read_text()
    parsed = parse_game(box, pbp, 6422772, individual)
    stats = parse_individual_stats(individual, 6422772, parsed.summary)
    karaban = next(stat for stat in stats if stat.name == "Alex Karaban")

    assert karaban.ncaa_player_id == 9324576
    assert karaban.player_internal_id == 786847679
    assert karaban.team_org_id == 164
    assert karaban.fgm == 8
    assert karaban.fga == 11
