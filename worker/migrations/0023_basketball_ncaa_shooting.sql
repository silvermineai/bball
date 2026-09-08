CREATE TABLE IF NOT EXISTS bb_ncaa_player_shooting (
 season INTEGER NOT NULL,
 player_id TEXT NOT NULL,
 team_id TEXT NOT NULL,
 player_name TEXT,
 team_name TEXT,
 stats_json TEXT NOT NULL,
 PRIMARY KEY(season, player_id, team_id)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_shooting_season ON bb_ncaa_player_shooting(season);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_shooting_player ON bb_ncaa_player_shooting(season, player_id);
