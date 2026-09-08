import type { BBRoster, BBRosters } from "./basketball-types";

export type RosterBoardSort =
  | "ppg"
  | "mpg"
  | "minutes"
  | "ts"
  | "efg"
  | "box_bpm"
  | "apg"
  | "rpg";

export type RosterBoardStatus =
  | "all"
  | "same_program"
  | "different_program"
  | "new_to_dataset"
  | "ambiguous";

export type RosterBoardRow = BBRoster & {
  rank: number | null;
  workload_label: "High workload" | "Rotation workload" | "Limited sample" | "No prior record";
};

export type RosterBoardFilters = {
  query: string;
  status: RosterBoardStatus;
  sort: RosterBoardSort;
  minimumMinutes: number;
};

const number = (value: number | null | undefined) => value ?? -Infinity;

export function rosterBoardSortSearch(filters: RosterBoardFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "mpg") params.set("sort", filters.sort);
  if (filters.minimumMinutes) params.set("min", String(filters.minimumMinutes));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function parseRosterBoardFilters(search: string): RosterBoardFilters {
  const params = new URLSearchParams(search);
  const requestedStatus = params.get("status") as RosterBoardStatus | null;
  const requestedSort = params.get("sort") as RosterBoardSort | null;
  const minimumMinutes = Number(params.get("min") || 0);
  const statuses: RosterBoardStatus[] = [
    "all",
    "same_program",
    "different_program",
    "new_to_dataset",
    "ambiguous",
  ];
  const sorts: RosterBoardSort[] = [
    "ppg",
    "mpg",
    "minutes",
    "ts",
    "efg",
    "box_bpm",
    "apg",
    "rpg",
  ];
  return {
    query: params.get("q") || "",
    status:
      requestedStatus && statuses.includes(requestedStatus)
        ? requestedStatus
        : "all",
    sort:
      requestedSort && sorts.includes(requestedSort) ? requestedSort : "mpg",
    minimumMinutes:
      [0, 10, 20, 30].includes(minimumMinutes) ? minimumMinutes : 0,
  };
}

export function rosterBoardRows(
  data: BBRosters,
  filters: RosterBoardFilters,
): RosterBoardRow[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = data.players.filter((player) => {
    const text = [player.name, player.team, ...player.previous_teams]
      .join(" ")
      .toLocaleLowerCase();
    const minutes = player.prior_production?.minutes ?? 0;
    return (
      (!query || text.includes(query)) &&
      (filters.status === "all" || player.status === filters.status) &&
      minutes >= filters.minimumMinutes
    );
  });
  const rows = [...filtered].sort((a, b) => {
    const av = a.prior_production?.[filters.sort] ?? null;
    const bv = b.prior_production?.[filters.sort] ?? null;
    return (
      number(bv) - number(av) ||
      (b.prior_production?.minutes ?? 0) - (a.prior_production?.minutes ?? 0) ||
      a.name.localeCompare(b.name)
    );
  });
  let previous: number | null = null;
  let previousRank = 0;
  return rows.map((player, index) => {
    const value = player.prior_production?.[filters.sort] ?? null;
    const rank = value == null ? null : value === previous ? previousRank : index + 1;
    if (value != null) {
      previous = value;
      previousRank = rank ?? index + 1;
    }
    const mpg = player.prior_production?.mpg ?? null;
    return {
      ...player,
      rank,
      workload_label:
        mpg == null
          ? "No prior record"
          : mpg >= 25
            ? "High workload"
            : mpg >= 15
              ? "Rotation workload"
              : "Limited sample",
    };
  });
}

export function rosterBoardTotals(rows: RosterBoardRow[]) {
  const priorMinutes = rows.reduce(
    (total, row) => total + (row.prior_production?.minutes ?? 0),
    0,
  );
  const linked = rows.filter((row) => row.prior_production).length;
  return {
    rows: rows.length,
    linked,
    priorMinutes,
    highWorkload: rows.filter((row) => row.workload_label === "High workload").length,
  };
}
