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
  games: number;
  minutes: number | null;
  points: number | null;
  ppg: number | null;
  mpg: number | null;
  ts: number | null;
  efg: number | null;
};

const finite = (value: Numeric): value is number =>
  typeof value === "number" && Number.isFinite(value);

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
      const games = seasonRows.reduce(
        (total, row) => total + (finite(row.games) ? row.games : 0),
        0,
      );
      const minutes = completeSum(seasonRows, "mins");
      const points = completeSum(seasonRows, "pts");
      const fgm = completeSum(seasonRows, "fgm");
      const fga = completeSum(seasonRows, "fga");
      const tpm = completeSum(seasonRows, "tpm");
      const fta = completeSum(seasonRows, "fta");
      return {
        season,
        teams: new Set(seasonRows.map((row) => row.team_id)).size,
        games,
        minutes,
        points,
        ppg: points != null && games > 0 ? points / games : null,
        mpg: minutes != null && games > 0 ? minutes / games : null,
        ts:
          points != null &&
          fga != null &&
          fta != null &&
          fga + 0.475 * fta > 0
            ? points / (2 * (fga + 0.475 * fta))
            : null,
        efg:
          fgm != null &&
          tpm != null &&
          fga != null &&
          fga > 0
            ? (fgm + 0.5 * tpm) / fga
            : null,
      };
    });
}
