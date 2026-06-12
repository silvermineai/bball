ALTER TABLE seasons ADD COLUMN internal_id TEXT;
ALTER TABLE teams ADD COLUMN internal_id TEXT;
ALTER TABLE games ADD COLUMN internal_id TEXT;
ALTER TABLE players ADD COLUMN internal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_seasons_internal_id ON seasons (internal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_internal_id ON teams (internal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_internal_id ON games (internal_id);
CREATE INDEX IF NOT EXISTS idx_players_internal_id ON players (internal_id);
