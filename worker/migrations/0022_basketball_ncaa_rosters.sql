CREATE TABLE IF NOT EXISTS bb_ncaa_rosters (
 season INTEGER NOT NULL,
 team_id TEXT NOT NULL,
 player_id TEXT NOT NULL,
 team_name TEXT,
 player_name TEXT,
 profile_json TEXT NOT NULL,
 PRIMARY KEY(season, team_id, player_id)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_rosters_season ON bb_ncaa_rosters(season);
CREATE INDEX IF NOT EXISTS bb_ncaa_rosters_player ON bb_ncaa_rosters(season, player_id);
CREATE INDEX IF NOT EXISTS bb_ncaa_rosters_team ON bb_ncaa_rosters(season, team_id);
