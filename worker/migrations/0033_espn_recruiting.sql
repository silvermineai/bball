-- Public ESPN recruiting rankings. This is a source-labeled prospect release,
-- separate from reviewed school announcements and portal eligibility evidence.
CREATE TABLE IF NOT EXISTS bb_espn_recruiting (
  edition TEXT NOT NULL,
  season INTEGER NOT NULL,
  athlete_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  grade REAL,
  rank INTEGER,
  position_rank INTEGER,
  state_rank INTEGER,
  region_rank INTEGER,
  status TEXT,
  committed_team_id TEXT,
  committed_team_name TEXT,
  school_ids_json TEXT NOT NULL,
  high_school TEXT,
  hometown TEXT,
  height_inches REAL,
  weight_pounds REAL,
  captured_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (edition, athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_espn_recruiting_season_rank
  ON bb_espn_recruiting(season, rank, captured_at);
CREATE INDEX IF NOT EXISTS bb_espn_recruiting_athlete_history
  ON bb_espn_recruiting(season, athlete_id, captured_at);
CREATE TABLE IF NOT EXISTS bb_espn_recruiting_current (
  season INTEGER PRIMARY KEY,
  edition TEXT NOT NULL,
  captured_at TEXT NOT NULL
);
