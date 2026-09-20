type Numeric = number | null | undefined;

export type TrajectoryInput = {
  season: number;
  team_id: string;
  games: Numeric;
  stats: Record<string, Numeric>;
};

export type TrajectorySeason = {
  season: number;
  teams: number;
  sourceRows: number;
  completeFields: number;
  fieldCount: number;
  games: number | null;
  minutes: number | null;
  points: number | null;
  possessions: number | null;
  ppg: number | null;
  mpg: number | null;
  pointsPerPossession: number | null;
  assistsPerPossession: number | null;
  turnoversPerPossession: number | null;
  threePointAttemptRate: number | null;
  freeThrowAttemptRate: number | null;
  ts: number | null;
  efg: number | null;
};

/**
 * Fields used by the trajectory's pooled rates. Coverage is counted across
 * every retained team row in a season, so a transfer stint with a missing
 * denominator remains visible instead of being silently treated as zero.
 */
export const TRAJECTORY_CORE_FIELDS = [
  "mins",
  "pts",
  "o_poss",
  "ast",
  "tov",
  "fgm",
  "fga",
  "tpm",
  "tpa",
  "fta",
] as const;

export type TrajectoryContext = {
  active: TrajectorySeason | undefined;
  prior: TrajectorySeason | undefined;
  ppgDelta: number | null;
};

const finite = (value: Numeric): value is number =>
  typeof value === "number" && Number.isFinite(value);

const nonnegative = (value: number | null): value is number =>
  value != null && value >= 0;

const boundedPart = (part: number | null, whole: number | null) =>
  nonnegative(part) && nonnegative(whole) && whole > 0 && part <= whole
    ? part / whole
    : null;

const positiveRate = (numerator: number | null, denominator: number | null) =>
  nonnegative(numerator) && nonnegative(denominator) && denominator > 0
    ? numerator / denominator
    : null;

const completeSum = (rows: TrajectoryInput[], key: string): number | null => {
  const values = rows.map((row) => row.stats[key]);
  return values.length > 0 && values.every(finite)
    ? values.reduce((total, value) => total + value, 0)
    : null;
};

/**
 * Aggregate team rows for one exact NCAA source player ID by season.
 *
 * A missing source field stays missing so a rate cannot acquire a fabricated
 * denominator. Rows are newest season first for the player-card workflow.
 */
export function buildNcaaPlayerTrajectory(
  rows: readonly TrajectoryInput[],
): TrajectorySeason[] {
  const bySeason = new Map<number, TrajectoryInput[]>();
  for (const row of rows) {
    const bucket = bySeason.get(row.season) || [];
    bucket.push(row);
    bySeason.set(row.season, bucket);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => b - a)
    .map(([season, seasonRows]) => {
      const gamesValues = seasonRows.map((row) => row.games);
      const games = gamesValues.every((value) => finite(value) && value >= 0)
        ? gamesValues.reduce<number>((total, value) => total + Number(value), 0)
        : null;
      const minutes = completeSum(seasonRows, "mins");
      const points = completeSum(seasonRows, "pts");
      const possessions = completeSum(seasonRows, "o_poss");
      const assists = completeSum(seasonRows, "ast");
      const turnovers = completeSum(seasonRows, "tov");
      const fgm = completeSum(seasonRows, "fgm");
      const fga = completeSum(seasonRows, "fga");
      const tpm = completeSum(seasonRows, "tpm");
      const tpa = completeSum(seasonRows, "tpa");
      const fta = completeSum(seasonRows, "fta");
      const completeFields = TRAJECTORY_CORE_FIELDS.filter((field) => completeSum(seasonRows, field) != null).length;
      return {
        season,
        teams: new Set(seasonRows.map((row) => row.team_id)).size,
        sourceRows: seasonRows.length,
        completeFields,
        fieldCount: TRAJECTORY_CORE_FIELDS.length,
        games,
        minutes,
        points,
        possessions,
        ppg: nonnegative(points) && games != null && games > 0 ? points / games : null,
        mpg: nonnegative(minutes) && games != null && games > 0 ? minutes / games : null,
        pointsPerPossession: positiveRate(points, possessions),
        assistsPerPossession: positiveRate(assists, possessions),
        turnoversPerPossession: positiveRate(turnovers, possessions),
        threePointAttemptRate: boundedPart(tpa, fga),
        freeThrowAttemptRate: positiveRate(fta, fga),
        ts:
          nonnegative(points) &&
          nonnegative(fga) &&
          nonnegative(fta) &&
          fga + 0.475 * fta > 0
            ? points / (2 * (fga + 0.475 * fta))
            : null,
        efg:
          nonnegative(fgm) &&
          nonnegative(tpm) &&
          nonnegative(fga) &&
          fga > 0 &&
          fgm <= fga &&
          tpm <= fgm
            ? (fgm + 0.5 * tpm) / fga
            : null,
      };
    });
}

/**
 * Resolve the season shown in the player-card summary and its immediately
 * preceding retained source season. The selected season wins; when a card is
 * opened without a matching season, the newest retained row is the fallback.
 */
export function trajectoryContext(
  rows: readonly TrajectorySeason[],
  selectedSeason: number,
): TrajectoryContext {
  const active = rows.find((row) => row.season === selectedSeason) || rows[0];
  const prior = active
    ? rows.find((row) => row.season < active.season)
    : undefined;
  return {
    active,
    prior,
    ppgDelta:
      active?.ppg != null && prior?.ppg != null
        ? active.ppg - prior.ppg
        : null,
  };
}
