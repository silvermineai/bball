from ncaa_scraper.womens_basketball_sources import DATASETS, WOMENS_BASKETBALL_ATTRIBUTION


def test_womens_catalog_is_source_native_and_separate():
    assert DATASETS["schedule"] == (
        "espn_womens_college_basketball_schedules",
        "wbb_schedule_{year}.parquet",
    )
    assert DATASETS["player_season"][0].startswith("espn_womens_")
    assert "men's" not in WOMENS_BASKETBALL_ATTRIBUTION["scope"]
    assert "no direct scraping" in WOMENS_BASKETBALL_ATTRIBUTION["upstream"]
