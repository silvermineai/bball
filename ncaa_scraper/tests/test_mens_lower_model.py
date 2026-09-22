from ncaa_scraper.mens_lower_model import build_division_artifact, normalize_final_games


def contest(contest_id, date, home_slug, away_slug, home_score, away_score, division=2, state="F"):
    return {
        "division": division,
        "contest_id": contest_id,
        "contest_date": date,
        "state": state,
        "status": "final" if state == "F" else "scheduled",
        "teams": [
            {"home": True, "slug": home_slug, "name": home_slug or "Home", "conference": "c1", "score": home_score},
            {"home": False, "slug": away_slug, "name": away_slug or "Away", "conference": "c2", "score": away_score},
        ],
    }


def season_contests(count=220):
    return [
        contest(
            index + 1,
            f"01/{(index % 28) + 1:02d}/2026",
            f"home-{index % 12}",
            f"away-{index % 13}",
            70 + (index % 20),
            60 + (index % 15),
        )
        for index in range(count)
    ]


def test_mens_artifact_keeps_gender_and_model_namespace_separate():
    artifact = build_division_artifact(
        season_contests(),
        2,
        source_receipts=[{"url": "https://example.test/source", "sha256": "a" * 64}],
        source_asset_sha256="b" * 64,
    )
    assert artifact["gender"] == "men"
    assert artifact["model_id"].startswith("mbb-lower-ratings-v1-d2-")
    assert artifact["model_status"] == "research_only"
    assert artifact["forecast_status"] == "not_published"
    assert artifact["target_schedule"]["status"] == "missing"
    assert any(check["key"] == "multi_season_history" and check["status"] == "blocked" for check in artifact["readiness"])


def test_mens_normalizer_preserves_exact_division_scope():
    rows = [contest(1, "01/01/2026", "alpha", "beta", 70, 60, division=2), contest(2, "01/02/2026", "alpha", "beta", 70, 60, division=3)]
    games, excluded = normalize_final_games(rows, 2)
    assert [game["game_id"] for game in games] == ["1"]
    assert excluded["wrong_division"] == 1
