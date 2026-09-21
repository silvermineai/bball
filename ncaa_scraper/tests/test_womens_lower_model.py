from ncaa_scraper.womens_lower_model import build_division_artifact, normalize_final_games


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
    rows = []
    for index in range(count):
        rows.append(contest(index + 1, f"01/{(index % 28) + 1:02d}/2026", f"home-{index % 12}", f"away-{index % 13}", 70 + (index % 20), 60 + (index % 15)))
    return rows


def test_normalize_final_games_requires_exact_division_and_source_slugs():
    rows = [
        contest(1, "01/01/2026", "alpha", "beta", 70, 60, division=2),
        contest(2, "01/02/2026", "alpha", "beta", 70, 60, division=3),
        contest(3, "01/03/2026", None, "beta", 70, 60, division=2),
        contest(4, "01/04/2026", "alpha", "beta", 70, 60, division=2, state="P"),
    ]
    games, excluded = normalize_final_games(rows, 2)
    assert [row["game_id"] for row in games] == ["1"]
    assert excluded["wrong_division"] == 1
    assert excluded["missing_slug"] == 1
    assert excluded["non_final"] == 1


def test_build_artifact_is_research_only_and_has_chronological_backtest():
    artifact = build_division_artifact(season_contests(), 2, source_receipts=[{"url": "https://example.test/source", "sha256": "a" * 64}], source_asset_sha256="b" * 64)
    assert artifact["model_status"] == "research_only"
    assert artifact["forecast_status"] == "not_published"
    assert artifact["coverage"]["valid_final_games"] == 220
    assert len(artifact["ratings"]) >= 20
    assert artifact["backtest"]["status"] == "retrospective_only"
    assert artifact["backtest"]["training_games"] < artifact["coverage"]["valid_final_games"]
    assert artifact["target_schedule"]["status"] == "missing"
    assert artifact["model_id"].startswith("wbb-lower-ratings-v1-d2-")
    assert any(check["key"] == "multi_season_history" and check["status"] == "blocked" for check in artifact["readiness"])
    assert all("forecast" not in row for row in artifact["ratings"])
