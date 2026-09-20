import type { RecruitingPerson } from "./recruiting";

export type ProspectProduction = NonNullable<RecruitingPerson["stats"]>;

export type ProspectProductionRelease = {
  season: number;
  edition: string;
  reviewedAt: string;
  production: ProspectProduction | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

function finiteNumber(value: unknown): number | undefined;
function finiteNumber(value: unknown, nullable: true): number | null | undefined;
function finiteNumber(value: unknown, nullable = false): number | null | undefined {
  if (value == null && nullable) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Find reviewed prior production only through the immutable source ID shared
 * by the ranked prospect and the reviewed release. A malformed, mixed-season,
 * duplicate, or incomplete match is withheld instead of becoming a name-based
 * recruiting claim.
 */
export function parseProspectProductionRelease(
  payload: unknown,
  expectedSeason: number,
  athleteId: string,
): ProspectProductionRelease | null {
  if (
    !isRecord(payload) ||
    payload.season !== expectedSeason ||
    typeof payload.edition !== "string" ||
    !payload.edition.trim() ||
    typeof payload.reviewed_at !== "string" ||
    !payload.reviewed_at.trim() ||
    !Array.isArray(payload.people) ||
    !/^\d{1,15}$/.test(athleteId)
  ) return null;

  const matches = payload.people.filter((person) => {
    if (!isRecord(person) || !isRecord(person.stats)) return false;
    return person.stats.id === athleteId;
  });
  if (matches.length > 1) return null;
  if (matches.length === 0) {
    return {
      season: expectedSeason,
      edition: payload.edition,
      reviewedAt: payload.reviewed_at,
      production: null,
    };
  }

  const person = matches[0];
  if (!isRecord(person) || !isRecord(person.stats)) return null;
  const stats = person.stats;
  const id = stringValue(stats.id);
  const teamId = stringValue(stats.team_id);
  const team = stringValue(stats.team);
  const identityBasis = stringValue(stats.identity_basis);
  const statSeason = finiteNumber(stats.season);
  const games = finiteNumber(stats.games);
  const mpg = finiteNumber(stats.mpg);
  const incompleteBoxGames = finiteNumber(stats.incomplete_box_games);
  if (
    !id ||
    !teamId ||
    !team ||
    !identityBasis ||
    statSeason === undefined ||
    !Number.isInteger(statSeason) ||
    games === undefined ||
    !Number.isInteger(games) ||
    games < 0 ||
    mpg === undefined ||
    mpg < 0 ||
    incompleteBoxGames === undefined ||
    !Number.isInteger(incompleteBoxGames) ||
    incompleteBoxGames < 0
  ) return null;

  const nullableMetrics = [
    "ppg", "rpg", "apg", "spg", "bpg", "topg", "efg", "ts",
    "three_pct", "ft_pct", "ft_rate", "three_rate", "tov_rate",
  ] as const;
  const metrics = Object.fromEntries(nullableMetrics.map((key) => {
    const value = finiteNumber(stats[key], true);
    return [key, value === undefined ? NaN : value];
  }));
  if (Object.values(metrics).some((value) => Number.isNaN(value))) return null;

  return {
    season: expectedSeason,
    edition: payload.edition,
    reviewedAt: payload.reviewed_at,
    production: {
      id,
      team_id: teamId,
      team,
      season: statSeason,
      games,
      mpg,
      ppg: metrics.ppg,
      rpg: metrics.rpg,
      apg: metrics.apg,
      spg: metrics.spg,
      bpg: metrics.bpg,
      topg: metrics.topg,
      efg: metrics.efg,
      ts: metrics.ts,
      three_pct: metrics.three_pct,
      ft_pct: metrics.ft_pct,
      ft_rate: metrics.ft_rate,
      three_rate: metrics.three_rate,
      tov_rate: metrics.tov_rate,
      incomplete_box_games: incompleteBoxGames,
      identity_basis: identityBasis,
    },
  };
}
