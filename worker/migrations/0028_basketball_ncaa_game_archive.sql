CREATE TABLE IF NOT EXISTS bb_ncaa_player_box (
 season INTEGER NOT NULL,
 contest_id TEXT NOT NULL,
 team_id TEXT NOT NULL,
 player_id TEXT NOT NULL,
 game_date TEXT,
 team_name TEXT,
 opponent_name TEXT,
 player_name TEXT,
 stats_json TEXT NOT NULL,
 PRIMARY KEY(season, contest_id, team_id, player_id)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_season ON bb_ncaa_player_box(season);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_player ON bb_ncaa_player_box(season, player_id);
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_team ON bb_ncaa_player_box(season, team_id);

-- ESPN game-day context. Keep every source field in raw_json while exposing
-- stable IDs for bounded matchup and availability queries.
CREATE TABLE IF NOT EXISTS bb_ncaa_game_rosters (
 season INTEGER NOT NULL,
 game_id TEXT NOT NULL,
 team_id TEXT NOT NULL,
 athlete_id TEXT NOT NULL,
 team_name TEXT,
 home_away TEXT,
 athlete_name TEXT,
 jersey TEXT,
 position TEXT,
 starter INTEGER,
 did_not_play INTEGER,
 active INTEGER,
 ejected INTEGER,
 reason TEXT,
 raw_json TEXT NOT NULL,
 PRIMARY KEY(season, game_id, team_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_game_rosters_game ON bb_ncaa_game_rosters(season, game_id);
CREATE INDEX IF NOT EXISTS bb_ncaa_game_rosters_athlete ON bb_ncaa_game_rosters(season, athlete_id);
CREATE INDEX IF NOT EXISTS bb_ncaa_game_rosters_team ON bb_ncaa_game_rosters(season, team_id);

CREATE TABLE IF NOT EXISTS bb_ncaa_officials (
 season INTEGER NOT NULL,
 game_id TEXT NOT NULL,
 official_order INTEGER NOT NULL,
 official_name TEXT,
 official_position TEXT,
 official_position_id INTEGER,
 raw_json TEXT NOT NULL,
 PRIMARY KEY(season, game_id, official_order)
);
CREATE INDEX IF NOT EXISTS bb_ncaa_officials_game ON bb_ncaa_officials(season, game_id);
