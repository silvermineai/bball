CREATE TABLE IF NOT EXISTS bb_lineups (
 season INTEGER NOT NULL, lineup_key TEXT NOT NULL, team_name TEXT NOT NULL,
 players_json TEXT NOT NULL, stats_json TEXT NOT NULL,
 PRIMARY KEY(season,lineup_key)
);
CREATE INDEX IF NOT EXISTS bb_lineups_lookup ON bb_lineups(season,team_name);
