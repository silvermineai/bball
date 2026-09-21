from ncaa_scraper.womens_shot_profiles import build_shot_profiles


def test_profiles_keep_attempt_denominators_and_bin_coordinates():
    profiles = build_shot_profiles(
        [
            {"shooter_id": "p1", "shooter_clean_name": "A", "team_id": "T", "shot_x": "-25", "shot_y": "-5.25", "made": "true"},
            {"shooter_id": "p1", "shooter_clean_name": "A", "team_id": "T", "shot_x": "0", "shot_y": "0", "made": "false"},
            {"shooter_id": "p1", "shooter_clean_name": "A", "team_id": "T", "shot_x": "bad", "shot_y": "0", "made": "false"},
        ]
    )
    assert profiles[0]["attempts"] == 3
    assert profiles[0]["makes"] == 1
    assert profiles[0]["located_attempts"] == 2
    assert sum(cell["attempts"] for cell in profiles[0]["cells"]) == 2
    assert profiles[0]["bands"] == [
        {"label": "Rim", "attempts": 1, "makes": 0},
        {"label": "Paint", "attempts": 0, "makes": 0},
        {"label": "Midrange", "attempts": 0, "makes": 0},
        {"label": "3-point", "attempts": 1, "makes": 1},
    ]
    assert profiles[0]["sides"] == [
        {"label": "Chart left", "attempts": 1, "makes": 1},
        {"label": "Middle", "attempts": 1, "makes": 0},
        {"label": "Chart right", "attempts": 0, "makes": 0},
    ]


def test_profiles_flag_identity_collisions_without_joining_names():
    profiles = build_shot_profiles(
        [
            {"shooter_id": "p1", "shooter_clean_name": "A", "team_id": "T1", "shot_x": "1", "shot_y": "1", "made": 1},
            {"shooter_id": "p1", "shooter_clean_name": "B", "team_id": "T2", "shot_x": "1", "shot_y": "1", "made": 0},
        ]
    )
    assert profiles[0]["identity_status"] == "ambiguous"
    assert profiles[0]["name"] == "A"
