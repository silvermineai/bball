CREATE TABLE IF NOT EXISTS bb_roster_models (
  primary_model_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bb_roster_scenarios (
  primary_model_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  away_id TEXT NOT NULL,
  lens_json TEXT NOT NULL,
  PRIMARY KEY (primary_model_id, game_id),
  FOREIGN KEY (primary_model_id) REFERENCES bb_roster_models(primary_model_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_roster_scenarios_game_model
  ON bb_roster_scenarios(game_id, primary_model_id);
