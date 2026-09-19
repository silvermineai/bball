-- The game archive is naturally partitioned by season, but player cards also
-- expose a career game-log view. Keep that exact-ID lookup bounded without
-- changing or deduplicating the retained source rows.
CREATE INDEX IF NOT EXISTS bb_ncaa_player_box_player_career
  ON bb_ncaa_player_box(player_id, season, game_date, contest_id);
