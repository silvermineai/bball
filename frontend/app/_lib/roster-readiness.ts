import type { BBOverview, BBRosterModel, BBRosters } from "./basketball-types";

export type RosterLabSort =
  | "represented"
  | "returning"
  | "incoming"
  | "listed"
  | "rating"
  | "bpm";
export type RosterLabFilters = {
  query: string;
  sort: RosterLabSort;
  ratedOnly: boolean;
};

export type RosterPositionGroup = "guard" | "forward" | "center" | "unreported";
export type RosterPositionCounts = Record<RosterPositionGroup, number>;
export type RosterPositionWorkload = {
  priorMinutes: number;
  returningMinutes: number;
  incomingPriorMinutes: number;
  returningShare: number | null;
};
export type RosterTurnover = {
  row: RosterLabRow;
  group: Exclude<RosterPositionGroup, "unreported">;
  priorMinutes: number;
  returningMinutes: number;
  incomingPriorMinutes: number;
  unreturnedMinutes: number;
  turnoverShare: number;
};

/** Source-reported class labels are normalized only for stable grouping. */
export type RosterClassGroup = "freshman" | "sophomore" | "junior" | "senior" | "unreported";
export type RosterClassCounts = Record<RosterClassGroup, number>;
export type RosterClassWorkload = {
  priorMinutes: number;
  returningMinutes: number;
  incomingPriorMinutes: number;
  returningShare: number | null;
};

const rosterLabSorts = new Set<RosterLabSort>([
  "represented",
  "returning",
  "incoming",
  "listed",
  "rating",
  "bpm",
]);

/** Read the roster impact lab controls from a shareable URL. */
export function parseRosterLabFilters(search: string): RosterLabFilters {
  const params = new URLSearchParams(search);
  const sort = params.get("sort") as RosterLabSort | null;
  return {
    query: params.get("q") || "",
    sort: sort && rosterLabSorts.has(sort) ? sort : "represented",
    ratedOnly: params.get("rated") === "1",
  };
}

/** Serialize non-default roster impact lab controls for a compact handoff URL. */
export function rosterLabFilterSearch(filters: RosterLabFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.sort !== "represented") params.set("sort", filters.sort);
  if (filters.ratedOnly) params.set("rated", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Normalize the source's short position labels for a descriptive roster shape. */
export function rosterPositionGroup(position: string | null): RosterPositionGroup {
  const value = (position || "").trim().toUpperCase();
  if (["G", "PG", "SG", "GUARD"].includes(value)) return "guard";
  if (["F", "SF", "PF", "FORWARD", "WING"].includes(value)) return "forward";
  if (["C", "CENTER"].includes(value)) return "center";
  return "unreported";
}

/** Normalize the source's class-year labels without inferring eligibility or age. */
export function rosterClassGroup(classYear: string | null): RosterClassGroup {
  const value = (classYear || "").trim().toLowerCase();
  if (value === "freshman") return "freshman";
  if (value === "sophomore") return "sophomore";
  if (value === "junior") return "junior";
  if (value === "senior") return "senior";
  return "unreported";
}

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
  positionCounts: RosterPositionCounts;
  positionWorkload: Record<RosterPositionGroup, RosterPositionWorkload>;
  classCounts: RosterClassCounts;
  classWorkload: Record<RosterClassGroup, RosterClassWorkload>;
  upperclassPriorMinutesShare: number | null;
  ratingRank: number | null;
  adjustedNet: number | null;
  priorBpm: number | null;
  returningBpm: number | null;
  representedBpm: number | null;
  incomingBpm: number | null;
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
  rosterModel?: BBRosterModel,
): RosterLabRow[] {
  const ratings = new Map(overview.ratings.map((row) => [row.id, row]));
  const publisherValues = new Map(
    (rosterModel?.teams ?? []).map((row) => [row.team_id, row]),
  );
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
      const positionCounts: RosterPositionCounts = {
        guard: 0,
        forward: 0,
        center: 0,
        unreported: 0,
      };
      const positionWorkload = Object.fromEntries(
        (["guard", "forward", "center", "unreported"] as RosterPositionGroup[]).map(
          (group) => [
            group,
            { priorMinutes: 0, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: null },
          ],
        ),
      ) as Record<RosterPositionGroup, RosterPositionWorkload>;
      const classCounts: RosterClassCounts = {
        freshman: 0,
        sophomore: 0,
        junior: 0,
        senior: 0,
        unreported: 0,
      };
      const classWorkload = Object.fromEntries(
        (["freshman", "sophomore", "junior", "senior", "unreported"] as RosterClassGroup[]).map(
          (group) => [
            group,
            { priorMinutes: 0, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: null },
          ],
        ),
      ) as Record<RosterClassGroup, RosterClassWorkload>;
      for (const player of players) {
        const group = rosterPositionGroup(player.position);
        positionCounts[group] += 1;
        const classGroup = rosterClassGroup(player.class_year);
        classCounts[classGroup] += 1;
        const minutes = player.prior_production?.minutes ?? 0;
        positionWorkload[group].priorMinutes += minutes;
        classWorkload[classGroup].priorMinutes += minutes;
        if (player.status === "same_program") {
          positionWorkload[group].returningMinutes += minutes;
          classWorkload[classGroup].returningMinutes += minutes;
        } else if (player.status === "different_program") {
          positionWorkload[group].incomingPriorMinutes += minutes;
          classWorkload[classGroup].incomingPriorMinutes += minutes;
        }
      }
      for (const workload of Object.values(positionWorkload)) {
        workload.returningShare =
          workload.priorMinutes > 0
            ? workload.returningMinutes / workload.priorMinutes
            : null;
      }
      for (const workload of Object.values(classWorkload)) {
        workload.returningShare =
          workload.priorMinutes > 0
            ? workload.returningMinutes / workload.priorMinutes
            : null;
      }
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
      const publisherValue = publisherValues.get(teamId);
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
        positionCounts,
        positionWorkload,
        classCounts,
        classWorkload,
        upperclassPriorMinutesShare:
          priorMinutes > 0
            ? (classWorkload.junior.priorMinutes + classWorkload.senior.priorMinutes) /
              priorMinutes
            : null,
        ratingRank: rating?.rank ?? null,
        adjustedNet: rating?.adj_net ?? null,
        priorBpm: publisherValue?.prior_bpm ?? null,
        returningBpm: publisherValue?.returning_bpm ?? null,
        representedBpm: publisherValue?.represented_bpm ?? null,
        incomingBpm: publisherValue?.incoming_bpm ?? null,
        upcomingGames: coverage.upcoming,
        forecastedGames: coverage.forecasted,
      } satisfies RosterLabRow;
    })
    .sort((a, b) => a.team.localeCompare(b.team));
}

/** Find the lowest returning-workload positions in the observed program sample. */
export function positionContinuityWatch(
  rows: RosterLabRow[],
  group: RosterPositionGroup,
  limit = 5,
) {
  return rows
    .map((row) => ({ row, workload: row.positionWorkload[group] }))
    .filter(({ workload }) => workload.priorMinutes > 0)
    .sort(
      (a, b) =>
        (a.workload.returningShare ?? 2) - (b.workload.returningShare ?? 2) ||
        b.workload.priorMinutes - a.workload.priorMinutes ||
        a.row.team.localeCompare(b.row.team),
    )
    .slice(0, limit);
}

/**
 * Surface prior workload that is not represented by same-program listings,
 * while keeping incoming prior minutes visible. This is a recruiting
 * investigation queue, not a departure, eligibility or roster projection.
 */
export function positionTurnoverWatch(rows: RosterLabRow[], limit = 8): RosterTurnover[] {
  const groups = ["guard", "forward", "center"] as const;
  return rows
    .flatMap((row) =>
      groups.map((group) => {
        const workload = row.positionWorkload[group];
        const unreturnedMinutes = Math.max(0, workload.priorMinutes - workload.returningMinutes);
        return {
          row,
          group,
          priorMinutes: workload.priorMinutes,
          returningMinutes: workload.returningMinutes,
          incomingPriorMinutes: workload.incomingPriorMinutes,
          unreturnedMinutes,
          turnoverShare: workload.priorMinutes > 0 ? unreturnedMinutes / workload.priorMinutes : 0,
        } satisfies RosterTurnover;
      }),
    )
    .filter((gap) => gap.unreturnedMinutes > 0)
    .sort(
      (a, b) =>
        b.unreturnedMinutes - a.unreturnedMinutes ||
        b.turnoverShare - a.turnoverShare ||
        a.row.team.localeCompare(b.row.team) ||
        a.group.localeCompare(b.group),
    )
    .slice(0, limit);
}

/** Find programs whose observed prior workload is least upperclass-heavy. */
export function classExperienceWatch(rows: RosterLabRow[], limit = 5) {
  return [...rows]
    .filter((row) => row.upperclassPriorMinutesShare != null && row.priorMinutes > 0)
    .sort(
      (a, b) =>
        (a.upperclassPriorMinutesShare ?? 2) - (b.upperclassPriorMinutesShare ?? 2) ||
        b.priorMinutes - a.priorMinutes ||
        a.team.localeCompare(b.team),
    )
    .slice(0, limit);
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
              : sort === "rating"
                ? nullableDescending(a.adjustedNet, b.adjustedNet)
                : nullableDescending(a.representedBpm, b.representedBpm);
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
    row.positionCounts.guard,
    row.positionCounts.forward,
    row.positionCounts.center,
    row.positionCounts.unreported,
    ...(["guard", "forward", "center"] as const).flatMap((group) => {
      const workload = row.positionWorkload[group];
      return [
        workload.priorMinutes,
        workload.returningMinutes,
        workload.incomingPriorMinutes,
        workload.returningShare == null ? null : workload.returningShare * 100,
      ];
    }),
    row.classCounts.freshman,
    row.classCounts.sophomore,
    row.classCounts.junior,
    row.classCounts.senior,
    row.classCounts.unreported,
    ...(["freshman", "sophomore", "junior", "senior"] as const).flatMap((group) => {
      const workload = row.classWorkload[group];
      return [
        workload.priorMinutes,
        workload.returningMinutes,
        workload.incomingPriorMinutes,
        workload.returningShare == null ? null : workload.returningShare * 100,
      ];
    }),
    row.upperclassPriorMinutesShare == null ? null : row.upperclassPriorMinutesShare * 100,
    row.ratingRank,
    row.adjustedNet,
    row.priorBpm,
    row.returningBpm,
    row.representedBpm,
    row.incomingBpm,
    row.upcomingGames,
    row.forecastedGames,
  ]);
}
