-- Season-scoped refreshes clear these rows before replaying the verified
-- release. Keep the delete path indexed so a large historical warehouse does
-- not turn a small scoped delete into a full-table storage operation.
CREATE INDEX IF NOT EXISTS bb_unresolved_season ON bb_unresolved(season);
