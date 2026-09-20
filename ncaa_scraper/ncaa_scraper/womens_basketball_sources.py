"""Women’s college basketball bulk-release catalog.

These are SportsDataverse release assets, kept separate from the men’s
namespace so a scope selector can never silently substitute rows.
"""

from .football_sources import ATTRIBUTION, ROOT, ReleaseClient

PREFIX = "espn_womens_college_basketball_"
DATASETS = {
    "schedule": (PREFIX + "schedules", "wbb_schedule_{year}.parquet"),
    "rosters": (PREFIX + "rosters", "rosters_{year}.parquet"),
    "player_season": (
        PREFIX + "player_season_stats",
        "player_season_stats_{year}.parquet",
    ),
    "team_season": (
        PREFIX + "team_season_stats",
        "team_season_stats_{year}.parquet",
    ),
    "player_box": (
        PREFIX + "player_boxscores",
        "player_box_{year}.parquet",
    ),
    "team_box": (
        PREFIX + "team_boxscores",
        "team_box_{year}.parquet",
    ),
    "shots": ("ncaa_wbb_shots", "ncaa_wbb_shots_{year}.parquet"),
}
WOMENS_BASKETBALL_ATTRIBUTION = {
    **ATTRIBUTION,
    "upstream": "ESPN and NCAA-derived records via SportsDataverse women’s bulk releases; no direct scraping.",
    "scope": "women’s basketball; source-native records remain separate from men’s basketball",
}


def client():
    return ReleaseClient(ROOT / ".local/womens-basketball", DATASETS, WOMENS_BASKETBALL_ATTRIBUTION)
