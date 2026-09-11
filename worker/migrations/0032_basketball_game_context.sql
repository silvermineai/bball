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
