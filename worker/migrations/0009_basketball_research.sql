CREATE TABLE IF NOT EXISTS bb_sources (dataset TEXT, season INTEGER, receipt_json TEXT NOT NULL, PRIMARY KEY(dataset,season));
CREATE TABLE IF NOT EXISTS bb_unresolved (
 dataset TEXT, season INTEGER, row_index INTEGER, reason TEXT NOT NULL, source_json TEXT NOT NULL,
 PRIMARY KEY(dataset,season,row_index)
);
CREATE TABLE IF NOT EXISTS bb_games (
 id TEXT PRIMARY KEY, season INTEGER NOT NULL, starts_at TEXT NOT NULL,
 home_id TEXT NOT NULL, away_id TEXT NOT NULL, home_name TEXT, away_name TEXT,
 home_score REAL, away_score REAL, completed INTEGER NOT NULL, neutral INTEGER NOT NULL,
 periods INTEGER, time_tbd INTEGER NOT NULL, venue TEXT, broadcast TEXT
);
CREATE INDEX IF NOT EXISTS bb_games_season ON bb_games(season,starts_at);
CREATE TABLE IF NOT EXISTS bb_team_box (
 game_id TEXT, team_id TEXT, season INTEGER, stats_json TEXT NOT NULL,
 PRIMARY KEY(game_id,team_id)
);
CREATE TABLE IF NOT EXISTS bb_players (id TEXT PRIMARY KEY, name TEXT NOT NULL, position TEXT);
CREATE TABLE IF NOT EXISTS bb_player_box (
 game_id TEXT, team_id TEXT, athlete_id TEXT, season INTEGER, stats_json TEXT NOT NULL,
 PRIMARY KEY(game_id,team_id,athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_player_box_player ON bb_player_box(athlete_id,season);
CREATE TABLE IF NOT EXISTS bb_player_season (
 season INTEGER, team_id TEXT, athlete_id TEXT, stats_json TEXT NOT NULL,
 PRIMARY KEY(season,team_id,athlete_id)
);
CREATE TABLE IF NOT EXISTS bb_rosters (
 season INTEGER, team_id TEXT, athlete_id TEXT, profile_json TEXT NOT NULL,
 PRIMARY KEY(season,team_id,athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_rosters_player ON bb_rosters(athlete_id,season);
CREATE TABLE IF NOT EXISTS bb_participation (
 season INTEGER, team_id TEXT, athlete_id TEXT, name TEXT, games INTEGER, minutes REAL,
 PRIMARY KEY(season,team_id,athlete_id)
);
CREATE TABLE IF NOT EXISTS bb_impact (
 season INTEGER, ncaa_player_id TEXT, data_json TEXT NOT NULL,
 PRIMARY KEY(season,ncaa_player_id)
);
CREATE TABLE IF NOT EXISTS bb_models (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, artifact_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bb_forecasts (
 game_id TEXT, model_id TEXT, created_at TEXT NOT NULL, prediction_json TEXT NOT NULL,
 PRIMARY KEY(game_id,model_id)
);
