import type { RecruitingPerson } from "./recruiting";
import type { BBRosters } from "./basketball-types";

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

export type RecruitingDestinationProductionSummary = {
  teamId: string;
  additions: number;
  priorPrograms: number;
  games: number;
  weightedMpg: number | null;
  weightedPpg: number | null;
  weightedRpg: number | null;
  weightedApg: number | null;
  weightedTs: number | null;
};

export type RecruitingDestinationRosterAudit = {
  teamId: string;
  incomingRows: number;
  exactRosterIds: number;
  atDestination: number;
  elsewhere: number;
  multiplePrograms: number;
  notObserved: number;
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
  // Validate the whole transfer production namespace before applying the
  // ranking floor. A malformed or duplicated ID in a below-floor row is
  // still an identity collision in the retained release; silently filtering
  // it could make an otherwise broken source packet look rankable.
  const transferSourceRows = people.filter((person) => person.category === "transfer" && person.stats != null) as Array<RecruitingPerson & { stats: RecruitingProductionStats }>;
  const sourceIds = transferSourceRows.map((person) => person.stats.id);
  if (sourceIds.some((id) => !validSourceId(id)) || new Set(sourceIds).size !== sourceIds.length) return [];
  const candidates = transferSourceRows.filter((person) =>
    Number.isSafeInteger(person.stats.games)
    && person.stats.games >= minGames,
  );

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

/**
 * Roll the same exact-ID rows up to their recorded destination. Rates are
 * weighted by recorded games, and a missing rate remains unavailable. This
 * gives staff a destination workload view without summing incomparable
 * per-game values or treating an absent stat as zero.
 */
export function summarizeRecruitingDestinationProduction(
  people: RecruitingPerson[],
  options: RecruitingProductionRankOptions = {},
): RecruitingDestinationProductionSummary[] {
  const rows = rankRecruitingProduction(people, options);
  const groups = new Map<string, RecruitingProductionRankRow[]>();
  for (const row of rows) {
    const teamId = row.person.team_id.trim();
    if (!teamId) return [];
    const group = groups.get(teamId) || [];
    group.push(row);
    groups.set(teamId, group);
  }
  const weighted = (group: RecruitingProductionRankRow[], metric: RecruitingProductionMetric) => {
    const values = group.filter((row) => finiteNonnegative(row.stats[metric]));
    const denominator = values.reduce((sum, row) => sum + row.stats.games, 0);
    return denominator > 0
      ? values.reduce((sum, row) => sum + (row.stats[metric] as number) * row.stats.games, 0) / denominator
      : null;
  };
  return [...groups.entries()]
    .map(([teamId, group]) => ({
      teamId,
      additions: group.length,
      priorPrograms: new Set(group.map((row) => row.stats.team_id).filter(Boolean)).size,
      games: group.reduce((sum, row) => sum + row.stats.games, 0),
      weightedMpg: weighted(group, "mpg"),
      weightedPpg: weighted(group, "ppg"),
      weightedRpg: weighted(group, "rpg"),
      weightedApg: weighted(group, "apg"),
      weightedTs: weighted(group, "ts"),
    }))
    .sort((left, right) => right.additions - left.additions || (right.weightedPpg ?? -Infinity) - (left.weightedPpg ?? -Infinity) || left.teamId.localeCompare(right.teamId));
}

/**
 * Compare reviewed transfer source IDs with the retained roster release. The
 * result describes source-listing evidence only: it does not infer that an
 * unobserved player departed, that an observed row is eligible, or that a
 * destination is confirmed. A duplicated recruiting source ID withholds the
 * complete audit so a bad identity packet cannot create a false fit signal.
 */
export function auditRecruitingDestinationRoster(
  people: RecruitingPerson[],
  rosters: BBRosters,
): RecruitingDestinationRosterAudit[] {
  const eligible = people.filter((person) =>
    person.category === "transfer"
    && person.stats != null
    && validSourceId(person.stats.id)
    && Number.isSafeInteger(person.stats.games)
    && person.stats.games >= 10,
  ) as Array<RecruitingPerson & { stats: RecruitingProductionStats }>;
  if (new Set(eligible.map((person) => person.stats.id)).size !== eligible.length) return [];
  const byDestination = new Map<string, RecruitingDestinationRosterAudit>();
  for (const person of eligible) {
    const teamId = person.team_id.trim();
    if (!teamId) return [];
    const current = byDestination.get(teamId) || {
      teamId,
      incomingRows: 0,
      exactRosterIds: 0,
      atDestination: 0,
      elsewhere: 0,
      multiplePrograms: 0,
      notObserved: 0,
    };
    current.incomingRows += 1;
    const matches = rosters.players.filter((row) => row.id === person.stats.id);
    const teamIds = new Set(matches.map((row) => row.team_id).filter(Boolean));
    if (!matches.length) {
      current.notObserved += 1;
    } else {
      current.exactRosterIds += 1;
      const includesDestination = teamIds.has(teamId);
      if (teamIds.size > 1) current.multiplePrograms += 1;
      else if (includesDestination) current.atDestination += 1;
      else current.elsewhere += 1;
    }
    byDestination.set(teamId, current);
  }
  return [...byDestination.values()].sort((left, right) => right.incomingRows - left.incomingRows || left.teamId.localeCompare(right.teamId));
}
