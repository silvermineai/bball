CREATE TABLE IF NOT EXISTS bb_shot_sources (
  season INTEGER PRIMARY KEY,
  edition TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  coverage_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bb_shot_games (
  edition TEXT NOT NULL,
  season INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(edition, season, game_id, part)
);
CREATE TABLE IF NOT EXISTS bb_shot_profiles (
  edition TEXT NOT NULL,
  season INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('team','player')),
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(edition, season, kind, entity_id)
);
