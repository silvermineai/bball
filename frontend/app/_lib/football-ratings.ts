import type { Overview } from "./data";
import type { EfficiencyIndex, EfficiencyTeam, Rate } from "./football-efficiency";

export type FootballRatingEfficiencyRow = Overview["ratings"][number] & {
  efficiency: {
    season: number;
    division: string;
    games: number;
    source_fetched_at: string;
    offense_epa: number | null;
    defense_epa: number | null;
    offense_ypp: number | null;
    defense_ypp: number | null;
  } | null;
};

function measured(rate: Rate | undefined) {
  return rate && Number.isFinite(rate.value) ? rate.value : null;
}

function teamEfficiency(team: EfficiencyTeam, sourceFetchedAt: string): NonNullable<FootballRatingEfficiencyRow["efficiency"]> {
  const sample = team.samples.all;
  return {
    season: team.season,
    division: team.division,
    games: sample.games,
    source_fetched_at: sourceFetchedAt,
    offense_epa: measured(sample.offense.epa),
    defense_epa: measured(sample.defense.epa),
    offense_ypp: measured(sample.offense.ypp),
    defense_ypp: measured(sample.defense.ypp),
  };
}

/**
 * Attach the dated efficiency release to model ratings by exact team ID.
 * A missing release or ID stays null; team names are never used as a join key.
 */
export function joinFootballRatingEfficiency(
  ratings: Overview["ratings"],
  index: EfficiencyIndex,
  season: number,
) {
  const release = index.seasons.find((candidate) => candidate.season === season);
  const teams = new Map((release?.teams || []).map((team) => [team.id, team]));
  return ratings.map((rating): FootballRatingEfficiencyRow => ({
    ...rating,
    efficiency: release && teams.get(rating.id)
      ? teamEfficiency(teams.get(rating.id)!, release.source_fetched_at)
      : null,
  }));
}
