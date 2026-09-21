import type { RecruitingPerson } from "./recruiting";

/**
 * Prior production fields used by the transfer review board. These are all
 * source-recorded rates or workload fields; the resulting index is a
 * comparison aid, not a forecast or an eligibility determination.
 */
export const recruitingProductionMetrics = [
  "mpg",
  "ppg",
  "rpg",
  "apg",
  "spg",
  "bpg",
  "ts",
  "efg",
] as const;

export type RecruitingProductionMetric = (typeof recruitingProductionMetrics)[number];
export type RecruitingProductionStats = NonNullable<RecruitingPerson["stats"]>;

export type RecruitingProductionRankRow = {
  person: RecruitingPerson;
  stats: RecruitingProductionStats;
  score: number | null;
  availableFields: number;
  scoredFields: number;
};

export type RecruitingProductionRankOptions = {
  minGames?: number;
  minFields?: number;
};

const validSourceId = (value: string) => /^\d{1,15}$/.test(value);
const finiteNonnegative = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value >= 0;

/**
 * Rank reviewed transfer rows by a transparent, cohort-relative production
 * index. Each field is standardized only across eligible rows and missing
 * source values are omitted from that player's average; they never become
 * zeroes. Duplicate or malformed source player IDs withhold the whole board
 * so a broken identity packet cannot look like a valid ranking.
 */
export function rankRecruitingProduction(
  people: RecruitingPerson[],
  options: RecruitingProductionRankOptions = {},
): RecruitingProductionRankRow[] {
  const minGames = Number.isSafeInteger(options.minGames) && (options.minGames ?? 0) >= 0
    ? options.minGames as number
    : 10;
  const minFields = Number.isSafeInteger(options.minFields) && (options.minFields ?? 1) > 0
    ? options.minFields as number
    : 4;
  const candidates = people.filter((person) =>
    person.category === "transfer"
    && person.stats != null
    && validSourceId(person.stats.id)
    && Number.isSafeInteger(person.stats.games)
    && person.stats.games >= minGames,
  ) as Array<RecruitingPerson & { stats: RecruitingProductionStats }>;
  const ids = candidates.map((person) => person.stats.id);
  if (new Set(ids).size !== ids.length) return [];

  const moments = new Map<RecruitingProductionMetric, { mean: number; sd: number }>();
  for (const metric of recruitingProductionMetrics) {
    const values = candidates
      .map((person) => person.stats[metric])
      .filter(finiteNonnegative);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      : 0;
    moments.set(metric, { mean, sd: Math.sqrt(variance) });
  }

  return candidates
    .map((person) => {
      const values = recruitingProductionMetrics.flatMap((metric) => {
        const value = person.stats[metric];
        const moment = moments.get(metric)!;
        return finiteNonnegative(value) && moment.sd > 0
          ? [(value - moment.mean) / moment.sd]
          : [];
      });
      const availableFields = recruitingProductionMetrics.filter((metric) => finiteNonnegative(person.stats[metric])).length;
      return {
        person,
        stats: person.stats,
        score: values.length >= minFields ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        availableFields,
        scoredFields: values.length,
      };
    })
    .sort((left, right) => {
      if (left.score == null && right.score != null) return 1;
      if (left.score != null && right.score == null) return -1;
      if (left.score != null && right.score != null && right.score !== left.score) return right.score - left.score;
      return left.person.name.localeCompare(right.person.name) || left.stats.id.localeCompare(right.stats.id);
    });
}

