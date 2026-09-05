CREATE TABLE IF NOT EXISTS football_sources (
 dataset TEXT NOT NULL, season INTEGER NOT NULL, receipt_json TEXT NOT NULL,
 PRIMARY KEY(dataset, season)
);
CREATE TABLE IF NOT EXISTS football_games (
 id TEXT PRIMARY KEY, season INTEGER NOT NULL, kickoff TEXT NOT NULL,
 home_id TEXT NOT NULL, away_id TEXT NOT NULL, home_name TEXT NOT NULL,
 away_name TEXT NOT NULL, home_conference TEXT, away_conference TEXT,
 home_division TEXT, away_division TEXT, home_score INTEGER, away_score INTEGER,
 completed INTEGER NOT NULL, neutral INTEGER NOT NULL, week INTEGER,
 venue TEXT, time_tbd INTEGER NOT NULL, source_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS football_games_date ON football_games(season, kickoff);
CREATE TABLE IF NOT EXISTS football_stats (
 dataset TEXT NOT NULL, season INTEGER NOT NULL, record_key TEXT NOT NULL,
 athlete_id TEXT, team_id TEXT, game_id TEXT, category TEXT, stats_json TEXT NOT NULL,
 PRIMARY KEY(dataset, season, record_key)
);
CREATE INDEX IF NOT EXISTS football_stats_player ON football_stats(athlete_id, season, dataset);
CREATE INDEX IF NOT EXISTS football_stats_game ON football_stats(game_id);
CREATE TABLE IF NOT EXISTS football_markets (
 game_id TEXT NOT NULL, observed_at TEXT NOT NULL, source TEXT NOT NULL,
 home_spread REAL, total REAL, is_pregame INTEGER NOT NULL,
 source_json TEXT NOT NULL,
 PRIMARY KEY(game_id, observed_at, source)
);
CREATE TABLE IF NOT EXISTS football_models (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, cutoff TEXT NOT NULL,
 artifact_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS football_predictions (
 game_id TEXT NOT NULL, model_id TEXT NOT NULL, created_at TEXT NOT NULL,
 home_margin REAL NOT NULL, total REAL NOT NULL, home_win_probability REAL NOT NULL,
 PRIMARY KEY(game_id, model_id)
);
CREATE TABLE IF NOT EXISTS football_artifacts (
 name TEXT PRIMARY KEY, generated_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
