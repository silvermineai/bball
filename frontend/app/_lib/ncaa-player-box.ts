export type NumericStats = Record<string, number | null | undefined>;

export type PlayerScoringProfileRow = {
  key: "rim" | "midrange" | "three" | "putback" | "halfcourt" | "transition" | "unassisted";
  label: string;
  makes: number | null;
  attempts: number | null;
  points: number | null;
  accuracy: number | null;
  effectiveFieldGoal: number | null;
  attemptShare: number | null;
  pointShare: number | null;
};

/** Return a rate only when both source fields are present and the denominator is positive. */
export function safeRate(made: number | null | undefined, attempted: number | null | undefined) {
  return made != null && attempted != null && attempted > 0 ? made / attempted : null;
}

/** Sum a composite stat only when every source component is present. */
export function safeSum(left: number | null | undefined, right: number | null | undefined) {
  return left != null && right != null ? left + right : null;
}

/**
 * Pool one source stat across team rows only when every stint contains a
 * finite value. A partial season total would turn an unknown stint into a
 * false zero and make a rate look more complete than its source evidence.
 */
export function completeStatsSum(
  rows: ReadonlyArray<{ stats: NumericStats }>,
  key: string,
) {
  if (!rows.length) return null;
  const values = rows.map((row) => row.stats[key]);
  if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Pool the additive box-score fields used by the player-card summary.
 *
 * A player can have multiple team stints in one edition. Keeping this helper
 * exact-ID and all-or-nothing per field means the card can show defensive
 * production and double-doubles without turning an absent source field into a
 * false zero.
 */
export function playerSeasonBoxSummary(rows: ReadonlyArray<{ stats: NumericStats }>) {
  const offensiveRebounds = completeStatsSum(rows, "orb");
  const defensiveRebounds = completeStatsSum(rows, "drb");
  return {
    minutes: completeStatsSum(rows, "mins"),
    points: completeStatsSum(rows, "pts"),
    rebounds: safeSum(offensiveRebounds, defensiveRebounds),
    assists: completeStatsSum(rows, "ast"),
    steals: completeStatsSum(rows, "stl"),
    blocks: completeStatsSum(rows, "blk"),
    turnovers: completeStatsSum(rows, "tov"),
    fouls: completeStatsSum(rows, "pf"),
    doubleDoubles: completeStatsSum(rows, "dbl_dbl"),
  };
}

/** Compute eFG% only when makes, threes and attempts are all source-reported. */
export function effectiveFieldGoal(
  fieldGoalsMade: number | null | undefined,
  threesMade: number | null | undefined,
  fieldGoalAttempts: number | null | undefined,
) {
  return fieldGoalsMade != null && threesMade != null
    ? safeRate(fieldGoalsMade + 0.5 * threesMade, fieldGoalAttempts)
    : null;
}

/** Compute the disclosed college TS% fallback without turning missing fields into zero. */
export function trueShooting(stats: NumericStats) {
  const points = stats.pts;
  const fga = stats.fga;
  const fta = stats.fta;
  if (points == null || fga == null || fta == null) return null;
  const denominator = 2 * (fga + 0.475 * fta);
  return denominator > 0 ? points / denominator : null;
}

/** Derive compact source rates for a player card without imputing missing fields. */
export function playerAdvancedRates(stats: NumericStats) {
  return {
    pointsPerPossession: safeRate(stats.pts, stats.o_poss),
    threePointAttemptRate: safeRate(stats.tpa, stats.fga),
    freeThrowAttemptRate: safeRate(stats.fta, stats.fga),
    assistRate: safeRate(stats.ast, stats.o_poss),
    turnoverRate: safeRate(stats.tov, stats.o_poss),
  };
}

const finiteStat = (stats: NumericStats, key: string) => {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/**
 * Turn retained scoring totals into a player-card drill-down without filling
 * gaps in the source. Zone rows and play-context rows are intentionally kept
 * separate: unassisted attempts can also occur in half-court or transition.
 */
export function playerScoringProfile(stats: NumericStats) {
  const fieldGoalAttempts = finiteStat(stats, "fga");
  const points = finiteStat(stats, "pts");
  const row = (
    key: PlayerScoringProfileRow["key"],
    label: string,
    makeKey: string,
    attemptKey: string,
    pointKey?: string,
    threeKey?: string,
  ): PlayerScoringProfileRow => {
    const makes = finiteStat(stats, makeKey);
    const attempts = finiteStat(stats, attemptKey);
    const rowPoints = pointKey ? finiteStat(stats, pointKey) : null;
    const threes = threeKey ? finiteStat(stats, threeKey) : null;
    return {
      key,
      label,
      makes,
      attempts,
      points: rowPoints,
      accuracy: safeRate(makes, attempts),
      effectiveFieldGoal: threeKey
        ? effectiveFieldGoal(makes, threes, attempts)
        : null,
      attemptShare: safeRate(attempts, fieldGoalAttempts),
      pointShare: pointKey ? safeRate(rowPoints, points) : null,
    };
  };

  return {
    zones: [
      row("rim", "At rim", "rimm", "rima"),
      row("midrange", "Midrange", "midm", "mida"),
      row("three", "3-point", "tpm", "tpa"),
      row("putback", "Putbacks", "pbackm", "pbacka"),
    ],
    contexts: [
      row("halfcourt", "Half court", "fgm_half", "fga_half", "pts_half", "tpm_half"),
      row("transition", "Transition", "fgm_trans", "fga_trans", "pts_trans", "tpm_trans"),
      row("unassisted", "Unassisted", "fgm_unast", "fga_unast", "pts_unast", "tpm_unast"),
    ],
    assistedMakeShare: safeRate(
      finiteStat(stats, "fgm_ast"),
      finiteStat(stats, "fgm"),
    ),
    assistedRimMakeShare: safeRate(
      finiteStat(stats, "rimm_ast"),
      finiteStat(stats, "rimm"),
    ),
    assistedThreeMakeShare: safeRate(
      finiteStat(stats, "tpm_ast"),
      finiteStat(stats, "tpm"),
    ),
  };
}
