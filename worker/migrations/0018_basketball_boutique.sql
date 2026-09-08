CREATE TABLE IF NOT EXISTS bb_publisher_ratings (
 season INTEGER NOT NULL, team_id TEXT NOT NULL, stats_json TEXT NOT NULL,
 PRIMARY KEY(season,team_id)
);
CREATE INDEX IF NOT EXISTS bb_publisher_ratings_rank ON bb_publisher_ratings(season);
CREATE TABLE IF NOT EXISTS bb_player_value (
 season INTEGER NOT NULL, player_id TEXT NOT NULL, team_id TEXT NOT NULL,
 player_name TEXT, stats_json TEXT NOT NULL,
 PRIMARY KEY(season,player_id,team_id)
);
CREATE INDEX IF NOT EXISTS bb_player_value_rank ON bb_player_value(season);
