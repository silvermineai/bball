CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_by_user_id INTEGER,
  mode TEXT NOT NULL CHECK (mode IN ('backfill', 'seed-team', 'scrape-pending', 'scrape-game')),
  season_label TEXT NOT NULL DEFAULT '2025-26',
  division TEXT NOT NULL DEFAULT '1' CHECK (division IN ('1', '2', '3')),
  seed_team_id INTEGER,
  contest_id INTEGER,
  max_teams INTEGER,
  game_limit INTEGER,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  runner_type TEXT NOT NULL DEFAULT 'scrapling-python',
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requested_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status_created ON scrape_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_division_created ON scrape_jobs (division, created_at);
