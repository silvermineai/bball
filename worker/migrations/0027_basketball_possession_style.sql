CREATE TABLE IF NOT EXISTS bb_possession_style (
  season INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  games INTEGER NOT NULL,
  possessions INTEGER NOT NULL,
  points INTEGER NOT NULL,
  transition_possessions INTEGER NOT NULL,
  assisted_possessions INTEGER NOT NULL,
  garbage_possessions INTEGER NOT NULL,
  style_json TEXT NOT NULL,
  PRIMARY KEY (season, team_id)
);
CREATE INDEX IF NOT EXISTS bb_possession_style_team_idx
  ON bb_possession_style (team_id, season);
