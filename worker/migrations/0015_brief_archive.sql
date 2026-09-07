CREATE TABLE IF NOT EXISTS brief_archive_objects (
  sha256 TEXT PRIMARY KEY,
  bundle_key TEXT NOT NULL,
  byte_offset INTEGER NOT NULL CHECK(byte_offset >= 0),
  byte_length INTEGER NOT NULL CHECK(byte_length > 0),
  raw_size INTEGER NOT NULL CHECK(raw_size > 0),
  content_type TEXT NOT NULL,
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS brief_archive_versions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  revision TEXT NOT NULL UNIQUE REFERENCES brief_archive_objects(sha256),
  sport TEXT NOT NULL CHECK(sport IN ('football','basketball')),
  game_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  time_tbd INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  forecast_generated_at TEXT NOT NULL,
  original_path TEXT NOT NULL,
  original_html_sha256 TEXT NOT NULL,
  dependencies_json TEXT NOT NULL,
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS brief_archive_game ON brief_archive_versions(sport,game_id,sequence DESC);
