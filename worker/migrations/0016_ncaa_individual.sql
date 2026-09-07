CREATE TABLE IF NOT EXISTS ncaa_individual_players (
  season INTEGER NOT NULL,
  division INTEGER NOT NULL CHECK(division IN (1,2,3)),
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  team_name TEXT,
  ppg REAL,
  rpg REAL,
  apg REAL,
  mpg REAL,
  ppg_rank INTEGER,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(season, division, player_id)
);
CREATE INDEX IF NOT EXISTS ncaa_individual_division_rank
  ON ncaa_individual_players(season, division, ppg_rank);
