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
