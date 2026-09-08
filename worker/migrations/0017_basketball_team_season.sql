CREATE TABLE IF NOT EXISTS bb_team_season (
 season INTEGER NOT NULL, team_id TEXT NOT NULL, team_name TEXT,
 team_abbreviation TEXT, stats_json TEXT NOT NULL,
 PRIMARY KEY(season,team_id)
);
CREATE INDEX IF NOT EXISTS bb_team_season_lookup ON bb_team_season(season,team_name);
