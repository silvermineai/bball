CREATE TABLE IF NOT EXISTS bb_career_seasons (
  season INTEGER PRIMARY KEY,
  edition TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  coverage_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bb_career_profiles (
  edition TEXT NOT NULL,
  season INTEGER NOT NULL,
  athlete_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(edition,season,athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_career_player ON bb_career_profiles(athlete_id,season);
CREATE TABLE IF NOT EXISTS bb_career_logs (
  edition TEXT NOT NULL,
  season INTEGER NOT NULL,
  athlete_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(edition,season,athlete_id,part)
);
