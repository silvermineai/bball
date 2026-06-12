CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  sport_code TEXT NOT NULL DEFAULT 'MBB',
  division TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  ncaa_team_id INTEGER PRIMARY KEY,
  org_id INTEGER,
  name TEXT NOT NULL,
  season_label TEXT,
  sport_code TEXT NOT NULL DEFAULT 'MBB',
  division TEXT NOT NULL DEFAULT '1',
  record TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  contest_id INTEGER PRIMARY KEY,
  season_label TEXT NOT NULL,
  game_date TEXT,
  venue TEXT,
  attendance INTEGER,
  away_team_id INTEGER,
  home_team_id INTEGER,
  away_org_id INTEGER,
  home_org_id INTEGER,
  away_score INTEGER,
  home_score INTEGER,
  scrape_status TEXT NOT NULL DEFAULT 'pending',
  last_scraped_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  ncaa_team_id INTEGER NOT NULL,
  opponent_team_id INTEGER,
  game_date TEXT,
  result TEXT,
  attendance INTEGER,
  is_away INTEGER NOT NULL DEFAULT 0,
  neutral_site TEXT,
  UNIQUE (contest_id, ncaa_team_id)
);

CREATE TABLE IF NOT EXISTS players (
  player_internal_id INTEGER PRIMARY KEY,
  ncaa_player_id INTEGER,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  team_org_id INTEGER,
  team_name TEXT,
  player_internal_id INTEGER,
  ncaa_player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  jersey_number TEXT,
  position TEXT,
  minutes TEXT,
  fgm INTEGER,
  fga INTEGER,
  fg_pct REAL,
  three_fgm INTEGER,
  three_fga INTEGER,
  ftm INTEGER,
  fta INTEGER,
  points INTEGER,
  offensive_rebounds INTEGER,
  defensive_rebounds INTEGER,
  total_rebounds INTEGER,
  assists INTEGER,
  turnovers INTEGER,
  steals INTEGER,
  blocks INTEGER,
  fouls INTEGER,
  disqualifications INTEGER,
  technical_fouls INTEGER,
  bench_points INTEGER,
  UNIQUE (contest_id, ncaa_player_id)
);

CREATE TABLE IF NOT EXISTS play_by_play_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  period INTEGER NOT NULL,
  clock TEXT NOT NULL,
  team_org_id INTEGER,
  team_name TEXT,
  player_internal_id INTEGER,
  ncaa_player_id INTEGER,
  player_name TEXT,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  UNIQUE (contest_id, sequence)
);

CREATE TABLE IF NOT EXISTS shots (
  play_id INTEGER PRIMARY KEY,
  contest_id INTEGER NOT NULL,
  sequence INTEGER,
  period INTEGER,
  clock TEXT,
  team_org_id INTEGER NOT NULL,
  player_internal_id INTEGER,
  ncaa_player_id INTEGER,
  player_name TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  made INTEGER NOT NULL,
  is_three INTEGER,
  shot_value INTEGER,
  description TEXT NOT NULL,
  classes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scrape_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  status_code INTEGER,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_season_date ON games (season_label, game_date);
CREATE INDEX IF NOT EXISTS idx_team_games_team_date ON team_games (ncaa_team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_game_stats (ncaa_player_id, contest_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_team ON player_game_stats (team_org_id, contest_id);
CREATE INDEX IF NOT EXISTS idx_shots_player ON shots (ncaa_player_id, contest_id);
CREATE INDEX IF NOT EXISTS idx_pbp_player ON play_by_play_actions (ncaa_player_id, contest_id);
