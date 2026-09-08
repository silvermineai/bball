import {
  recruitingRows,
  type RecruitingRelease,
} from "./recruiting";
import type { BBRoster, BBRosters } from "./basketball-types";

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
