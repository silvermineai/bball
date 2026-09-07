import type { BBRoster } from "./basketball-types";
import type { ScoutPlayer, ScoutProfile } from "./scouting-types";

export type RosterIntelPlayer = BBRoster & {
  priorPlayer: ScoutPlayer | null;
};

export type RosterIntel = {
  teamId: string;
  teamName: string;
  observed: number;
  returning: number;
  transfers: number;
  newToDataset: number;
  ambiguous: number;
  players: RosterIntelPlayer[];
  movement: RosterIntelPlayer[];
};

/**
 * Join the source-listed 2026–27 roster view to the prior-season production
 * profile by the publisher's athlete ID. This is descriptive recruiting
 * context: it never infers departures or changes the matchup forecast.
 */
export function buildRosterIntel(
  rosters: BBRoster[],
  profile: ScoutProfile,
): RosterIntel {
  const players = rosters
    .filter((player) => player.team_id === profile.id)
    .map((player) => ({
      ...player,
      priorPlayer:
        profile.players.find((prior) => prior.id === player.id) ?? null,
    }))
    .sort((a, b) => {
      const minutes =
        (b.priorPlayer?.minutes ?? 0) - (a.priorPlayer?.minutes ?? 0);
      return minutes || a.name.localeCompare(b.name);
    });
  const count = (status: string) =>
    players.filter((player) => player.status === status).length;
  const movement = players.filter((player) =>
    ["different_program", "new_to_dataset", "ambiguous"].includes(
      player.status,
    ),
  );
  return {
    teamId: profile.id,
    teamName: profile.name,
    observed: players.length,
    returning: count("same_program"),
    transfers: count("different_program"),
    newToDataset: count("new_to_dataset"),
    ambiguous: count("ambiguous"),
    players,
    movement,
  };
}
