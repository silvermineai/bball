CREATE TABLE IF NOT EXISTS bb_ncaa_player_box (
 season INTEGER NOT NULL,
 contest_id TEXT NOT NULL,
 team_id TEXT NOT NULL,
 player_id TEXT NOT NULL,
 game_date TEXT,
 team_name TEXT,
 opponent_name TEXT,
 player_name TEXT,
 stats_json TEXT NOT NULL,
 PRIMARY KEY(season, contest_id, team_id, player_id)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_season ON bb_ncaa_player_box(season);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_player ON bb_ncaa_player_box(season, player_id);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_team ON bb_ncaa_player_box(season, team_id);

CREATE TABLE IF NOT EXISTS bb_ncaa_player_season (
 season INTEGER NOT NULL,
 player_id TEXT NOT NULL,
 team_id TEXT NOT NULL,
 player_name TEXT,
 team_name TEXT,
 games INTEGER NOT NULL,
 stats_json TEXT NOT NULL,
 PRIMARY KEY(season, player_id, team_id)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_season_lookup ON bb_ncaa_player_season(season, player_id);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_season_team ON bb_ncaa_player_season(season, team_id);
