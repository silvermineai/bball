"""Published basketball release catalog; source-specific IDs remain separate."""

from .football_sources import ATTRIBUTION, ROOT, ReleaseClient

PREFIX = "espn_mens_college_basketball_"
DATASETS = {
    "pbp": (PREFIX + "pbp", "play_by_play_{year}.parquet"),
    "schedule": (PREFIX + "schedules", "mbb_schedule_{year}.parquet"),
    "team_box": (PREFIX + "team_boxscores", "team_box_{year}.parquet"),
    "player_box": (PREFIX + "player_boxscores", "player_box_{year}.parquet"),
    "participation": (PREFIX + "player_boxscores", "player_box_{year}.parquet"),
    "rosters": (PREFIX + "rosters", "rosters_{year}.parquet"),
    "player_season": (
        PREFIX + "player_season_stats",
        "player_season_stats_{year}.parquet",
    ),
    "team_season": (
        PREFIX + "team_season_stats",
        "team_season_stats_{year}.parquet",
    ),
    "publisher_ratings": ("mbb_ratings", "mbb_ratings_{year}.parquet"),
    "publisher_player_value": (
        "mbb_player_value",
        "mbb_player_value_{year}.parquet",
    ),
    "ncaa_lineups": ("ncaa_mbb_lineups", "ncaa_mbb_lineups_{year}.parquet"),
    "ncaa_matchup_stints": (
        "ncaa_mbb_matchup_stints",
        "ncaa_mbb_matchup_stints_{year}.parquet",
    ),
    "ncaa_team_box": ("ncaa_mbb_team_box", "ncaa_mbb_team_box_{year}.parquet"),
    "player_core": (PREFIX + "player_core", "player_core_{year}.parquet"),
    "player_crosswalk": ("mbb_crosswalk", "mbb_player_crosswalk_{year}.parquet"),
    "ncaa_rapm": ("ncaa_mbb_rapm", "ncaa_mbb_rapm_{year}.parquet"),
    "ncaa_rapm_within_team": (
        "ncaa_mbb_rapm_within_team",
        "ncaa_mbb_rapm_within_team_{year}.parquet",
    ),
    # NCAA-derived player box rows use the publisher's own identity namespace.
    # Keep them separate from ESPN athlete IDs while retaining the full stat
    # vector for scouting and audit work.
    "ncaa_player_box": ("ncaa_mbb_player_box", "ncaa_mbb_player_box_{year}.parquet"),
    "ncaa_team_rosters": ("ncaa_mbb_team_rosters", "ncaa_mbb_team_rosters_{year}.parquet"),
    "ncaa_shots": ("ncaa_mbb_shots", "ncaa_mbb_shots_{year}.parquet"),
}
BASKETBALL_ATTRIBUTION = {
    **ATTRIBUTION,
    "upstream": "ESPN and NCAA-derived records via SportsDataverse bulk releases; no direct scraping.",
}


def client():
    return ReleaseClient(ROOT / ".local/basketball", DATASETS, BASKETBALL_ATTRIBUTION)
