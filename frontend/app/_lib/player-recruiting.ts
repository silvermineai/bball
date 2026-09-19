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
