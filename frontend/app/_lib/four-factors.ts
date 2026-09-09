export type FourFactorInputs = {
  fieldGoalsMade: number | null;
  threePointersMade: number | null;
  fieldGoalsAttempted: number | null;
  turnovers: number | null;
  offensiveRebounds: number | null;
  opponentDefensiveRebounds: number | null;
  freeThrowsAttempted: number | null;
};

export type FourFactorResults = {
  effectiveFieldGoal: number | null;
  turnoverRate: number | null;
  offensiveReboundRate: number | null;
  freeThrowRate: number | null;
  estimatedPossessions: number | null;
};

const finite = (value: number | null): value is number =>
  value != null && Number.isFinite(value) && value >= 0;

const ratio = (numerator: number | null, denominator: number | null) =>
  finite(numerator) && finite(denominator) && denominator > 0
    ? numerator / denominator
    : null;

export function calculateFourFactors(inputs: FourFactorInputs): FourFactorResults {
  const {
    fieldGoalsMade,
    threePointersMade,
    fieldGoalsAttempted,
    turnovers,
    offensiveRebounds,
    opponentDefensiveRebounds,
    freeThrowsAttempted,
  } = inputs;
  const possessions =
    finite(fieldGoalsAttempted) &&
    finite(freeThrowsAttempted) &&
    finite(offensiveRebounds) &&
    finite(turnovers)
      ? fieldGoalsAttempted + 0.475 * freeThrowsAttempted - offensiveRebounds + turnovers
      : null;
  return {
    effectiveFieldGoal: ratio(
      finite(fieldGoalsMade) && finite(threePointersMade)
        ? fieldGoalsMade + 0.5 * threePointersMade
        : null,
      fieldGoalsAttempted,
    ),
    turnoverRate: ratio(turnovers, possessions),
    offensiveReboundRate: ratio(
      offensiveRebounds,
      finite(offensiveRebounds) && finite(opponentDefensiveRebounds)
        ? offensiveRebounds + opponentDefensiveRebounds
        : null,
    ),
    freeThrowRate: ratio(freeThrowsAttempted, fieldGoalsAttempted),
    estimatedPossessions: possessions,
  };
}
