import type { RecruitingPerson, RecruitingRelease } from "./recruiting";

export type RecruitingProductionRow = NonNullable<RecruitingPerson["stats"]>;

/**
 * Build the exact-ID production side of the recruiting board.
 *
 * The national prospect board and the reviewed production release are
 * separate source editions.  They are therefore never joined by name or
 * edition digest.  A row is eligible only when the reviewed release carries a
 * unique numeric athlete ID; duplicate IDs withhold the complete bridge so an
 * ambiguous source packet cannot look like a clean comparison.
 */
export type RecruitingProductionIndex = {
  season: number;
  edition: string;
  reviewedAt: string;
  sourceRows: number;
  linkedRows: number;
  byAthleteId: ReadonlyMap<string, RecruitingProductionRow>;
};

/**
 * Look up prior production by exact athlete ID only. The prospect board and
 * reviewed production release are separate editions, so there is no name
 * fallback or cross-season inference here.
 */
export function exactRecruitingProduction(
  index: RecruitingProductionIndex | null | undefined,
  athleteId: string,
): RecruitingProductionRow | null {
  if (!index || !/^\d{1,15}$/.test(athleteId)) return null;
  return index.byAthleteId.get(athleteId) || null;
}

export function buildRecruitingProductionIndex(
  release: RecruitingRelease,
): RecruitingProductionIndex | null {
  if (
    !Number.isSafeInteger(release.season)
    || release.season < 2025
    || !/^[a-f0-9]{64}$/i.test(release.edition)
    || !release.reviewed_at
    || !Number.isFinite(Date.parse(release.reviewed_at))
    || !Number.isSafeInteger(release.coverage.players)
    || release.coverage.players !== release.people.length
  ) return null;

  const byAthleteId = new Map<string, RecruitingProductionRow>();
  for (const person of release.people) {
    const stats = person.stats;
    if (!stats) continue;
    if (!/^\d{1,15}$/.test(stats.id) || byAthleteId.has(stats.id)) return null;
    byAthleteId.set(stats.id, stats);
  }

  return {
    season: release.season,
    edition: release.edition.toLowerCase(),
    reviewedAt: release.reviewed_at,
    sourceRows: release.coverage.players,
    linkedRows: byAthleteId.size,
    byAthleteId,
  };
}
