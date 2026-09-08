CREATE TABLE IF NOT EXISTS bb_player_core (
 season INTEGER NOT NULL,
 athlete_id TEXT NOT NULL,
 profile_json TEXT NOT NULL,
 PRIMARY KEY(season, athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_player_core_season ON bb_player_core(season);
