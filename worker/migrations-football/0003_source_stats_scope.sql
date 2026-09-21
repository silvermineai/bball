-- Source-stat browsers frequently scope player rows through the retained
-- season team directory. Keep that exact-ID division lookup indexed so the
-- D2/D3 archive remains usable without scanning the full source warehouse.
CREATE INDEX IF NOT EXISTS football_stats_dataset_season_team
  ON football_stats(dataset, season, team_id);
