import {
  recruitingRows,
  type RecruitingRelease,
} from "./recruiting";
import type { BBRoster, BBRosters } from "./basketball-types";

export const PLAYER_RECRUITING_SEASON = 2027;

/**
 * The profile handoff uses the current retained API editions so a player page
 * cannot silently lag behind the recruiting desk's live evidence release.
 */
export function playerRecruitingContextRequests(
  season = PLAYER_RECRUITING_SEASON,
) {
  return {
    recruiting: `/api/basketball/research/recruiting?season=${season}`,
    rosters: `/api/basketball/research/rosters?season=${season}&limit=10000`,
  };
}

export const NATIONAL_PROSPECT_SEASONS = [2025, 2026, 2027, 2028, 2029, 2030] as const;

/** Build exact-ID national archive requests without allowing name discovery to become a join. */
export function playerNationalProspectRequests(id: string) {
  if (!/^\d{1,15}$/.test(id.trim())) return [];
  return NATIONAL_PROSPECT_SEASONS.map((season) => ({
    season,
    url: `/api/basketball/research/recruiting-rankings?season=${season}&athlete_id=${encodeURIComponent(id)}&page=0`,
  }));
}

export type NationalProspectEvidence = {
  season: number;
  athlete_id: string;
  name: string;
  position: string | null;
  rank: number | null;
  previous_rank: number | null;
  previous_captured_at: string | null;
  grade: number | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  status: string | null;
  captured_at: string | null;
  edition: string | null;
};

/**
 * Parse one exact-ID national prospect response. A missing row is a normal
 * unavailable result; malformed or duplicate matching rows are withheld.
 */
export function parsePlayerNationalProspectPayload(
  payload: unknown,
  expectedSeason: number,
  expectedAthleteId: string,
): NationalProspectEvidence | null {
  if (!isRecord(payload)
    || payload.season !== expectedSeason
    || !/^\d{1,15}$/.test(expectedAthleteId)
    || !Array.isArray(payload.rows)) return null;
  const matches = payload.rows.filter((value) => isRecord(value) && String(value.athlete_id || "") === expectedAthleteId);
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (!isRecord(row) || typeof row.name !== "string" || !row.name.trim()) return null;
  const nullableString = (value: unknown) => value == null ? null : typeof value === "string" ? value : undefined;
  const nullableNumber = (value: unknown) => value == null ? null : typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const position = nullableString(row.position);
  const rank = nullableNumber(row.rank);
  const previousRank = nullableNumber(row.previous_rank);
  const previousCapturedAt = nullableString(row.previous_captured_at);
  const grade = nullableNumber(row.grade);
  const committedTeamId = nullableString(row.committed_team_id);
  const committedTeamName = nullableString(row.committed_team_name);
  const status = nullableString(row.status);
  const capturedAt = nullableString(payload.captured_at);
  const edition = nullableString(payload.edition);
  if (position === undefined || rank === undefined || previousRank === undefined || previousCapturedAt === undefined || grade === undefined
    || committedTeamId === undefined || committedTeamName === undefined
    || status === undefined || capturedAt === undefined || edition === undefined) return null;
  return {
    season: expectedSeason,
    athlete_id: expectedAthleteId,
    name: row.name.trim(),
    position,
    rank,
    previous_rank: previousRank,
    previous_captured_at: previousCapturedAt,
    grade,
    committed_team_id: committedTeamId,
    committed_team_name: committedTeamName,
    status,
    captured_at: capturedAt,
    edition,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Keep the player handoff fail-closed. API responses are external evidence;
 * a partial JSON object should never be cast into a complete release and
 * rendered as if it were a verified player record.
 */
export function parseLivePlayerRecruitingPayload(
  recruiting: unknown,
  rosters: unknown,
): { recruiting: RecruitingRelease; rosters: BBRosters } | null {
  if (!isRecord(recruiting) || !isRecord(rosters)) return null;
  if (
    typeof recruiting.season !== "number" ||
    typeof recruiting.edition !== "string" ||
    typeof recruiting.reviewed_at !== "string" ||
    !Array.isArray(recruiting.people) ||
    !Array.isArray(recruiting.events) ||
    !Array.isArray(recruiting.programs) ||
    !Array.isArray(recruiting.sources) ||
    typeof rosters.season !== "number" ||
    typeof rosters.previous_season !== "number" ||
    !Array.isArray(rosters.players) ||
    !isRecord(rosters.status_counts)
  ) {
    return null;
  }
  return {
    recruiting: recruiting as unknown as RecruitingRelease,
    rosters: rosters as unknown as BBRosters,
  };
}

/**
 * Join recruiting and roster evidence only through the publisher's immutable
 * player ID. Names are useful for discovery, but are intentionally not used
 * to claim that two records describe the same person.
 */
export function playerRecruitingContext(
  id: string,
  recruiting: RecruitingRelease,
  rosters: BBRosters,
) {
  const announcements = recruitingRows(recruiting).filter(
    (row) => row.stats?.id === id,
  );
  const rosterObservations = rosters.players.filter((row) => row.id === id);
  return { announcements, rosterObservations, rosterSeason: rosters.season };
}

export type PlayerRecruitingContext = ReturnType<typeof playerRecruitingContext>;
export type PlayerRosterObservation = BBRoster;

export type PlayerRecruitingReadiness = {
  key: "announcement" | "production" | "roster";
  label: string;
  status: "recorded" | "unavailable";
  detail: string;
};

/**
 * Compress the exact-ID handoff into three auditable preparation checks.
 * Missing evidence remains unavailable; a missing roster row is never turned
 * into a departure or eligibility conclusion.
 */
export function playerRecruitingReadiness(
  context: Pick<PlayerRecruitingContext, "announcements" | "rosterObservations">,
): PlayerRecruitingReadiness[] {
  const productionRows = context.announcements.filter((row) => row.stats);
  return [
    {
      key: "announcement",
      label: "Dated school evidence",
      status: context.announcements.length ? "recorded" : "unavailable",
      detail: context.announcements.length
        ? `${context.announcements.length} reviewed program record${context.announcements.length === 1 ? "" : "s"}`
        : "No exact-ID announcement record",
    },
    {
      key: "production",
      label: "Prior college production",
      status: productionRows.length ? "recorded" : "unavailable",
      detail: productionRows.length
        ? `${productionRows.length} exact-ID stat profile${productionRows.length === 1 ? "" : "s"}`
        : "No exact-ID prior stat profile",
    },
    {
      key: "roster",
      label: "Current roster observation",
      status: context.rosterObservations.length ? "recorded" : "unavailable",
      detail: context.rosterObservations.length
        ? `${context.rosterObservations.length} source-listed roster row${context.rosterObservations.length === 1 ? "" : "s"}`
        : "No exact-ID roster row",
    },
  ];
}

/**
 * The compact stat set shown when a recruiting record is handed off to a
 * player profile.  Keep the labels and denominator visible so the profile
 * does not reduce a prior season to points and minutes alone.
 */
export type RecruitingStatSnapshot = {
  mpg?: number | null;
  ppg?: number | null;
  rpg?: number | null;
  apg?: number | null;
  spg?: number | null;
  bpg?: number | null;
  topg?: number | null;
  efg?: number | null;
  ts?: number | null;
  three_pct?: number | null;
  ft_pct?: number | null;
};

export const playerRecruitingStatRows = (stats: RecruitingStatSnapshot | null | undefined) => [
  { key: "mpg", label: "MIN/G", value: stats?.mpg ?? null, percent: false },
  { key: "ppg", label: "PTS/G", value: stats?.ppg ?? null, percent: false },
  { key: "rpg", label: "REB/G", value: stats?.rpg ?? null, percent: false },
  { key: "apg", label: "AST/G", value: stats?.apg ?? null, percent: false },
  { key: "spg", label: "STL/G", value: stats?.spg ?? null, percent: false },
  { key: "bpg", label: "BLK/G", value: stats?.bpg ?? null, percent: false },
  { key: "topg", label: "TO/G", value: stats?.topg ?? null, percent: false },
  { key: "efg", label: "eFG%", value: stats?.efg ?? null, percent: true },
  { key: "ts", label: "TS%", value: stats?.ts ?? null, percent: true },
  { key: "three_pct", label: "3P%", value: stats?.three_pct ?? null, percent: true },
  { key: "ft_pct", label: "FT%", value: stats?.ft_pct ?? null, percent: true },
] as const;
