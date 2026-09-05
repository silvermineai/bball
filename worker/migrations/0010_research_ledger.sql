CREATE TABLE IF NOT EXISTS audit_predictions (
 id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL, model_id TEXT NOT NULL,
 generated_at TEXT NOT NULL, registered_at TEXT NOT NULL, starts_at TEXT NOT NULL,
 time_tbd INTEGER NOT NULL, payload_json TEXT NOT NULL,
 UNIQUE(sport,game_id,model_id)
);
CREATE INDEX IF NOT EXISTS audit_predictions_game ON audit_predictions(sport,game_id,registered_at);
CREATE TABLE IF NOT EXISTS audit_game_states (
 id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL,
 observed_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_game_states_game ON audit_game_states(sport,game_id,observed_at);
CREATE TABLE IF NOT EXISTS audit_markets (
 id TEXT PRIMARY KEY, sport TEXT NOT NULL, game_id TEXT NOT NULL, provider TEXT NOT NULL,
 bookmaker TEXT NOT NULL, market TEXT NOT NULL, captured_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_markets_game ON audit_markets(sport,game_id,captured_at);
CREATE TABLE IF NOT EXISTS audit_receipts (
 id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, provider TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_unmatched (
 id TEXT PRIMARY KEY, sport TEXT NOT NULL, event_id TEXT NOT NULL,
 captured_at TEXT NOT NULL, reason TEXT NOT NULL, payload_json TEXT NOT NULL
);
