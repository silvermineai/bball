import type { BBRoster, BBRosters } from "../_lib/basketball-types";
import { rosterPositionGroup, type RosterPositionGroup } from "../_lib/roster-readiness";

export type NotebookRosterSummary = {
  listed: number;
  sameProgram: number;
  differentProgram: number;
  newToDataset: number;
  ambiguousOrOther: number;
  priorProfiles: number;
  priorMinutes: number;
};

export type NotebookRosterRoleContext = {
  teamId: string;
  rosterSeason: number;
  receipt: NonNullable<BBRosters["source"]>;
  roles: Array<{
    role: RosterPositionGroup;
    listed: number;
    priorProfiles: number;
    priorMinutes: number;
    sameProgramMinutes: number;
    differentProgramMinutes: number;
    otherPriorMinutes: number;
  }>;
};

const roles: RosterPositionGroup[] = ["guard", "forward", "center", "unreported"];

const validPriorProfile = (player: BBRoster) => {
  const profile = player.prior_production;
  return Boolean(
    profile
    && Number.isFinite(profile.games)
    && profile.games >= 0
    && Number.isFinite(profile.minutes)
    && profile.minutes >= 0,
  );
};

/** Summarize only the exact roster rows already attached to a game notebook. */
export function summarizeNotebookRoster(players: BBRoster[]): NotebookRosterSummary {
  const sameProgram = players.filter((player) => player.status === "same_program").length;
  const differentProgram = players.filter((player) => player.status === "different_program").length;
  const newToDataset = players.filter((player) => player.status === "new_to_dataset").length;
  const priorProfiles = players.filter(validPriorProfile);
  return {
    listed: players.length,
    sameProgram,
    differentProgram,
    newToDataset,
    ambiguousOrOther: players.length - sameProgram - differentProgram - newToDataset,
    priorProfiles: priorProfiles.length,
    priorMinutes: priorProfiles.reduce((total, player) => total + player.prior_production!.minutes, 0),
  };
}

/**
 * Build a role-level matchup view from one exact program's roster rows. Any
 * mixed team identity, repeated athlete, malformed workload or missing source
 * receipt withholds the context instead of publishing a partial comparison.
 */
export function notebookRosterRoleContext(
  players: BBRoster[],
  teamId: string,
  rosterSeason: number,
  source: BBRosters["source"],
): NotebookRosterRoleContext | null {
  if (
    !players.length
    || !/^\d{1,15}$/.test(teamId)
    || !Number.isInteger(rosterSeason)
    || rosterSeason < 2025
    || !source
    || typeof source.dataset !== "string"
    || !source.dataset.trim()
    || typeof source.sha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(source.sha256)
  ) return null;
  const ids = new Set<string>();
  for (const player of players) {
    if (player.team_id !== teamId || !/^\d{1,15}$/.test(player.id) || ids.has(player.id)) return null;
    ids.add(player.id);
    const production = player.prior_production;
    if (production && (
      !Number.isInteger(production.games)
      || production.games < 0
      || !Number.isFinite(production.minutes)
      || production.minutes < 0
    )) return null;
  }
  return {
    teamId,
    rosterSeason,
    receipt: source,
    roles: roles.map((role) => {
      const listed = players.filter((player) => rosterPositionGroup(player.position) === role);
      const withProduction = listed.filter((player) => player.prior_production != null);
      const minutes = (status?: string) => withProduction
        .filter((player) => status == null || player.status === status)
        .reduce((total, player) => total + player.prior_production!.minutes, 0);
      const priorMinutes = minutes();
      const sameProgramMinutes = minutes("same_program");
      const differentProgramMinutes = minutes("different_program");
      return {
        role,
        listed: listed.length,
        priorProfiles: withProduction.length,
        priorMinutes,
        sameProgramMinutes,
        differentProgramMinutes,
        otherPriorMinutes: priorMinutes - sameProgramMinutes - differentProgramMinutes,
      };
    }),
  };
}
