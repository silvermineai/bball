-- Authorized CollegeBasketballData API evidence. Raw provider payloads remain
-- private; the public Worker exposes only coverage metadata.
CREATE TABLE IF NOT EXISTS bb_cbbd_recruiting (
  record_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('portal','players','teams')),
  source_record_id TEXT NOT NULL,
  player_name TEXT,
  from_program TEXT,
  from_program_id TEXT,
  to_program TEXT,
  to_program_id TEXT,
  position TEXT,
  eligibility TEXT,
  years_remaining INTEGER,
  stars INTEGER,
  rating REAL,
  ranking INTEGER,
  captured_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  provider TEXT NOT NULL,
  license_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bb_cbbd_recruiting_season
  ON bb_cbbd_recruiting(season,kind,captured_at);
CREATE INDEX IF NOT EXISTS bb_cbbd_recruiting_provider
  ON bb_cbbd_recruiting(provider,captured_at);
