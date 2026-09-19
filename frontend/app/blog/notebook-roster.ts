import type { BBRoster } from "../_lib/basketball-types";

export type NotebookRosterSummary = {
  listed: number;
  sameProgram: number;
  differentProgram: number;
  newToDataset: number;
  ambiguousOrOther: number;
  priorProfiles: number;
  priorMinutes: number;
};

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
