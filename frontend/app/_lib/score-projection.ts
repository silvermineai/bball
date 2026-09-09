export type ScoreProjectionInputs = {
  homeOffense: number | null;
  awayOffense: number | null;
  homeDefense: number | null;
  awayDefense: number | null;
  pace: number | null;
  homeCourt: number | null;
};

export type ScoreProjection = ScoreProjectionInputs & {
  homeEfficiency: number | null;
  awayEfficiency: number | null;
  homeScore: number | null;
  awayScore: number | null;
  margin: number | null;
  total: number | null;
};

/**
 * A classroom projection from opponent-adjusted efficiency terms.
 *
 * It deliberately averages each team's offense with the opponent's defense,
 * then applies pace and a home-court term. This is a teaching aid, not the
 * published forecast model and it does not write to the forecast ledger.
 */
export function projectScore(inputs: ScoreProjectionInputs): ScoreProjection {
  const values = [
    inputs.homeOffense,
    inputs.awayOffense,
    inputs.homeDefense,
    inputs.awayDefense,
    inputs.pace,
    inputs.homeCourt,
  ];
  if (values.some((value) => value == null || !Number.isFinite(value))) {
    return {
      ...inputs,
      homeEfficiency: null,
      awayEfficiency: null,
      homeScore: null,
      awayScore: null,
      margin: null,
      total: null,
    };
  }
  const homeEfficiency = (inputs.homeOffense! + inputs.awayDefense!) / 2 + inputs.homeCourt!;
  const awayEfficiency = (inputs.awayOffense! + inputs.homeDefense!) / 2;
  const homeScore = (inputs.pace! * homeEfficiency) / 100;
  const awayScore = (inputs.pace! * awayEfficiency) / 100;
  return {
    ...inputs,
    homeEfficiency,
    awayEfficiency,
    homeScore,
    awayScore,
    margin: homeScore - awayScore,
    total: homeScore + awayScore,
  };
}
