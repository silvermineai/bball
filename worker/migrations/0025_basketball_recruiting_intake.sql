-- Authorized provider evidence only. This table is separate from the curated
-- school-announcement release and never changes forecast or roster status.
CREATE TABLE IF NOT EXISTS bb_recruiting_intake (
  record_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  player_source_id TEXT,
  from_program TEXT,
  from_program_id TEXT,
  to_program TEXT NOT NULL,
  to_program_id TEXT,
  status TEXT NOT NULL,
  status_date TEXT NOT NULL,
  source_published_on TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_publisher TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  license_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bb_recruiting_intake_season
  ON bb_recruiting_intake(season,status,status_date);
CREATE INDEX IF NOT EXISTS bb_recruiting_intake_provider
  ON bb_recruiting_intake(provider,captured_at);
