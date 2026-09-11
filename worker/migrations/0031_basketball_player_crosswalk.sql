-- Cross-publisher identifiers from the attributed SportsDataverse release.
-- These rows reconcile ESPN, Fox and Yahoo identifiers only; they are not an
-- NCAA identity join and must not be used to infer eligibility or transfers.
CREATE TABLE IF NOT EXISTS bb_player_crosswalk (
 season INTEGER NOT NULL,
 espn_team_id TEXT NOT NULL,
 team_abbreviation TEXT,
 player_name TEXT,
 espn_athlete_id TEXT NOT NULL,
 espn_full_name TEXT,
 espn_jersey TEXT,
 espn_position TEXT,
 fox_athlete_id TEXT,
 fox_player TEXT,
 fox_jersey TEXT,
 fox_position_group TEXT,
 yahoo_player_id TEXT,
 yahoo_player_name TEXT,
 match_method TEXT NOT NULL,
 match_confidence REAL,
 match_keys TEXT,
 PRIMARY KEY(season, espn_team_id, espn_athlete_id)
);
CREATE INDEX IF NOT EXISTS bb_player_crosswalk_espn ON bb_player_crosswalk(espn_athlete_id, season);
CREATE INDEX IF NOT EXISTS bb_player_crosswalk_name ON bb_player_crosswalk(player_name, season);
CREATE INDEX IF NOT EXISTS bb_player_crosswalk_fox ON bb_player_crosswalk(fox_athlete_id, season);
CREATE INDEX IF NOT EXISTS bb_player_crosswalk_yahoo ON bb_player_crosswalk(yahoo_player_id, season);
