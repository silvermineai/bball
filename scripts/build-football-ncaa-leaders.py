#!/usr/bin/env python3
"""Build source-native NCAA football leaderboards for every available season."""

from ncaa_scraper.football_ncaa_leaders import DEFAULT_DB, DEFAULT_OUTPUT, write_release

if __name__ == "__main__":
    import sqlite3

    with sqlite3.connect(f"file:{DEFAULT_DB}?mode=ro", uri=True) as conn:
        seasons = [
            int(row[0])
            for row in conn.execute(
                "SELECT season FROM football_stats WHERE dataset='ncaa_player_stats' "
                "AND season IS NOT NULL AND json_extract(stats_json, '$.category') IN "
                "('passing','rushing','receiving','defense','kicking','punt_returns') "
                "GROUP BY season ORDER BY season"
            )
        ]
    if not seasons:
        raise SystemExit("No NCAA football player-stat seasons are available")
    written = []
    for season in seasons:
        output = DEFAULT_OUTPUT if season == max(seasons) else DEFAULT_OUTPUT.with_name(
            f"ncaa-player-leaders-{season}.json"
        )
        release = write_release(DEFAULT_DB, output, season=season)
        written.append((season, sum(len(category["leaders"]) for category in release["categories"])))
    print({"seasons": written, "latest": max(seasons) if seasons else None})
