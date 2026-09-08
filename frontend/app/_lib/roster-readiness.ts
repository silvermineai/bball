import type { BBOverview, BBRosters } from "./basketball-types";

export type RosterLabSort =
  | "represented"
  | "returning"
  | "incoming"
  | "listed"
  | "rating";

export type RosterLabRow = {
  teamId: string;
  team: string;
  listed: number;
  returning: number;
  incoming: number;
  newToDataset: number;
  ambiguous: number;
  priorMinutes: number;
  returningMinutes: number;
  incomingPriorMinutes: number;
  representedPriorMinutes: number;
  returningShare: number | null;
  representedShare: number | null;
  incomingShare: number | null;
  ratingRank: number | null;
  adjustedNet: number | null;
  upcomingGames: number;
  forecastedGames: number;
};

/**
 * Join the source-listed 2026–27 roster observation to independent ratings
 * and schedule coverage. All workload values are prior-season recorded
 * minutes; this is a comparison lens, never a projected role or forecast.
 */
export function buildRosterLabRows(
  rosters: BBRosters,
  overview: BBOverview,
): RosterLabRow[] {
  const ratings = new Map(overview.ratings.map((row) => [row.id, row]));
  const schedule = new Map<string, { upcoming: number; forecasted: number }>();
  for (const game of overview.upcoming) {
    for (const teamId of [game.home_id, game.away_id]) {
      const current = schedule.get(teamId) ?? { upcoming: 0, forecasted: 0 };
      current.upcoming += 1;
      if (game.prediction) current.forecasted += 1;
      schedule.set(teamId, current);
    }
  }

  const grouped = new Map<string, typeof rosters.players>();
  for (const player of rosters.players) {
    const players = grouped.get(player.team_id) ?? [];
    players.push(player);
    grouped.set(player.team_id, players);
  }

  return [...grouped.entries()]
    .map(([teamId, players]) => {
      const count = (status: string) =>
        players.filter((player) => player.status === status).length;
      const priorMinutes = players.reduce(
        (total, player) => total + (player.prior_production?.minutes ?? 0),
        0,
      );
      const returningMinutes = players.reduce(
        (total, player) =>
          total +
          (player.status === "same_program"
            ? (player.prior_production?.minutes ?? 0)
            : 0),
        0,
      );
      const incomingPriorMinutes = players.reduce(
        (total, player) =>
          total +
          (player.status === "different_program"
            ? (player.prior_production?.minutes ?? 0)
            : 0),
        0,
      );
      const representedPriorMinutes = returningMinutes + incomingPriorMinutes;
      const rating = ratings.get(teamId);
      const coverage = schedule.get(teamId) ?? { upcoming: 0, forecasted: 0 };
      return {
        teamId,
        team: players[0]?.team ?? teamId,
        listed: players.length,
        returning: count("same_program"),
        incoming: count("different_program"),
        newToDataset: count("new_to_dataset"),
        ambiguous: count("ambiguous"),
        priorMinutes,
        returningMinutes,
        incomingPriorMinutes,
        representedPriorMinutes,
        returningShare:
          priorMinutes > 0 ? returningMinutes / priorMinutes : null,
        representedShare:
          priorMinutes > 0 ? representedPriorMinutes / priorMinutes : null,
        incomingShare:
          priorMinutes > 0 ? incomingPriorMinutes / priorMinutes : null,
        ratingRank: rating?.rank ?? null,
        adjustedNet: rating?.adj_net ?? null,
        upcomingGames: coverage.upcoming,
        forecastedGames: coverage.forecasted,
      } satisfies RosterLabRow;
    })
    .sort((a, b) => a.team.localeCompare(b.team));
}

function nullableDescending(
  a: number | null,
  b: number | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export function sortRosterLabRows(
  rows: RosterLabRow[],
  sort: RosterLabSort,
): RosterLabRow[] {
  return [...rows].sort((a, b) => {
    const value =
      sort === "represented"
        ? nullableDescending(a.representedShare, b.representedShare)
        : sort === "returning"
          ? nullableDescending(a.returningShare, b.returningShare)
          : sort === "incoming"
            ? nullableDescending(a.incomingPriorMinutes, b.incomingPriorMinutes)
            : sort === "listed"
              ? b.listed - a.listed
              : nullableDescending(a.adjustedNet, b.adjustedNet);
    return value || a.team.localeCompare(b.team);
  });
}

export function rosterLabCsv(rows: RosterLabRow[]) {
  return rows.map((row) => [
    row.team,
    row.teamId,
    row.listed,
    row.returning,
    row.incoming,
    row.newToDataset,
    row.ambiguous,
    row.priorMinutes,
    row.returningMinutes,
    row.incomingPriorMinutes,
    row.representedPriorMinutes,
    row.returningShare == null ? null : row.returningShare * 100,
    row.representedShare == null ? null : row.representedShare * 100,
    row.incomingShare == null ? null : row.incomingShare * 100,
    row.ratingRank,
    row.adjustedNet,
    row.upcomingGames,
    row.forecastedGames,
  ]);
}
