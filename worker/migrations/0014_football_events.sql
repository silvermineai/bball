-- Immutable event editions preserve source-row identities across refreshed releases.
CREATE TABLE IF NOT EXISTS football_event_editions (
 edition TEXT PRIMARY KEY, dataset TEXT NOT NULL, season INTEGER NOT NULL,
 generated_at TEXT NOT NULL, receipt_json TEXT NOT NULL, coverage_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS football_event_active (
 dataset TEXT NOT NULL, season INTEGER NOT NULL, edition TEXT NOT NULL,
 PRIMARY KEY (dataset,season)
);
CREATE TABLE IF NOT EXISTS football_events (
 edition TEXT NOT NULL, record_key TEXT NOT NULL, game_id TEXT,
 team_id TEXT, player_name TEXT NOT NULL, division TEXT NOT NULL,
 kickoff TEXT, payload_json TEXT NOT NULL,
 PRIMARY KEY (edition,record_key)
);
CREATE INDEX IF NOT EXISTS football_events_team ON football_events(edition,team_id,game_id);
CREATE INDEX IF NOT EXISTS football_events_date ON football_events(edition,kickoff);
