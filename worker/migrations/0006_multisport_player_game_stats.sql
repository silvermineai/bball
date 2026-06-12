CREATE TABLE IF NOT EXISTS player_game_stats_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  team_org_id INTEGER,
  team_name TEXT,
  player_internal_id INTEGER,
  ncaa_player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  sport_code TEXT NOT NULL DEFAULT 'MBB',
  stat_group TEXT NOT NULL DEFAULT 'box',
  table_index INTEGER,
  row_index INTEGER,
  stats_json TEXT,
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
  UNIQUE (contest_id, ncaa_player_id, stat_group, team_org_id)
);

INSERT OR IGNORE INTO player_game_stats_v2 (
  id, contest_id, team_org_id, team_name, player_internal_id, ncaa_player_id, player_name,
  sport_code, stat_group, table_index, row_index, stats_json,
  jersey_number, position, minutes, fgm, fga, fg_pct, three_fgm, three_fga,
  ftm, fta, points, offensive_rebounds, defensive_rebounds, total_rebounds,
  assists, turnovers, steals, blocks, fouls, disqualifications, technical_fouls, bench_points
)
SELECT
  id, contest_id, team_org_id, team_name, player_internal_id, ncaa_player_id, player_name,
  'MBB', 'box', NULL, NULL, NULL,
  jersey_number, position, minutes, fgm, fga, fg_pct, three_fgm, three_fga,
  ftm, fta, points, offensive_rebounds, defensive_rebounds, total_rebounds,
  assists, turnovers, steals, blocks, fouls, disqualifications, technical_fouls, bench_points
FROM player_game_stats;

DROP TABLE player_game_stats;
ALTER TABLE player_game_stats_v2 RENAME TO player_game_stats;

CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_game_stats (ncaa_player_id, contest_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_team ON player_game_stats (team_org_id, contest_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_sport_group ON player_game_stats (sport_code, stat_group);
