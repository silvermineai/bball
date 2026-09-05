-- School publication dates and our first database observation are different clocks.
CREATE TABLE IF NOT EXISTS bb_recruiting_evidence (
  revision TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  published_on TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bb_recruiting_team ON bb_recruiting_evidence(season,team_id,published_on);
CREATE TABLE IF NOT EXISTS bb_recruiting_releases (
  edition TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS bb_recruiting_current (
  season INTEGER PRIMARY KEY,
  edition TEXT NOT NULL REFERENCES bb_recruiting_releases(edition)
);
