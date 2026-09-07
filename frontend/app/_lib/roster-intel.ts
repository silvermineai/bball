import type { BBRoster } from "./basketball-types";
import type { ScoutPlayer, ScoutProfile } from "./scouting-types";

export type RosterIntelPlayer = BBRoster & {
  priorPlayer: ScoutPlayer | null;
};

export type RosterSummary = {
  teamId: string;
  teamName: string;
  observed: number;
  returning: number;
  transfers: number;
  newToDataset: number;
  ambiguous: number;
  /** Prior-season recorded minutes represented by the source-listed group. */
  priorMinutes: number;
  returningMinutes: number;
  incomingPriorMinutes: number;
  representedPriorMinutes: number;
  returningMinutesShare: number | null;
  representedPriorMinutesShare: number | null;
  movement: BBRoster[];
};

export type RosterIntel = {
  teamId: string;
  teamName: string;
  observed: number;
  returning: number;
  transfers: number;
  newToDataset: number;
  ambiguous: number;
  priorMinutes: number;
  returningMinutes: number;
  incomingPriorMinutes: number;
  representedPriorMinutes: number;
  returningMinutesShare: number | null;
  representedPriorMinutesShare: number | null;
  players: RosterIntelPlayer[];
  movement: RosterIntelPlayer[];
};

/** Keep the client payload small while retaining counts for every program. */
export function buildRosterSummary(rosters: BBRoster[]): RosterSummary[] {
  const byTeam = new Map<string, BBRoster[]>();
  for (const player of rosters) {
    const rows = byTeam.get(player.team_id) ?? [];
    rows.push(player);
    byTeam.set(player.team_id, rows);
  }
  return [...byTeam.entries()]
    .map(([teamId, players]) => {
      const count = (status: string) =>
        players.filter((player) => player.status === status).length;
      const priorMinutes = players.reduce(
        (sum, player) => sum + (player.prior_production?.minutes ?? 0),
        0,
      );
      const returningMinutes = players.reduce(
        (sum, player) =>
          sum +
          (player.status === "same_program"
            ? (player.prior_production?.minutes ?? 0)
            : 0),
        0,
      );
      const incomingPriorMinutes = players.reduce(
        (sum, player) =>
          sum +
          (player.status === "different_program"
            ? (player.prior_production?.minutes ?? 0)
            : 0),
        0,
      );
      const representedPriorMinutes = returningMinutes + incomingPriorMinutes;
      return {
        teamId,
        teamName: players[0]?.team ?? teamId,
        observed: players.length,
        returning: count("same_program"),
        transfers: count("different_program"),
        newToDataset: count("new_to_dataset"),
        ambiguous: count("ambiguous"),
        priorMinutes,
        returningMinutes,
        incomingPriorMinutes,
        representedPriorMinutes,
        returningMinutesShare:
          priorMinutes > 0 ? returningMinutes / priorMinutes : null,
        representedPriorMinutesShare:
          priorMinutes > 0 ? representedPriorMinutes / priorMinutes : null,
        movement: players
          .filter((player) =>
            ["different_program", "new_to_dataset", "ambiguous"].includes(
              player.status,
            ),
          )
          .slice(0, 8),
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

/**
 * Join the source-listed 2026–27 roster view to the prior-season production
 * profile by the publisher's athlete ID. This is descriptive recruiting
 * context: it never infers departures or changes the matchup forecast.
 */
export function buildRosterIntel(
  rosters: RosterSummary[],
  profile: ScoutProfile,
): RosterIntel {
  const summary = rosters.find((roster) => roster.teamId === profile.id);
  const players = (summary?.movement ?? [])
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
  return {
    teamId: profile.id,
    teamName: profile.name,
    observed: summary?.observed ?? 0,
    returning: summary?.returning ?? 0,
    transfers: summary?.transfers ?? 0,
    newToDataset: summary?.newToDataset ?? 0,
    ambiguous: summary?.ambiguous ?? 0,
    priorMinutes: summary?.priorMinutes ?? 0,
    returningMinutes: summary?.returningMinutes ?? 0,
    incomingPriorMinutes: summary?.incomingPriorMinutes ?? 0,
    representedPriorMinutes: summary?.representedPriorMinutes ?? 0,
    returningMinutesShare: summary?.returningMinutesShare ?? null,
    representedPriorMinutesShare: summary?.representedPriorMinutesShare ?? null,
    players,
    movement: players,
  };
}
