import type { BBRoster } from "./basketball-types";

export type RosterSortKey =
  | "status"
  | "name"
  | "program"
  | "prior"
  | "workload"
  | "prior_ppg"
  | "prior_rpg"
  | "prior_apg"
  | "prior_ts"
  | "prior_efg";

export type RosterStatus =
  | "all"
  | "same_program"
  | "different_program"
  | "new_to_dataset"
  | "ambiguous";

export type RosterFilters = {
  season: "2027" | "2026";
  q: string;
  position: string;
  classYear: string;
  status: RosterStatus;
  sort: RosterSortKey;
  page: number;
  picks: string[];
};

const statusOrder: Record<string, number> = {
  different_program: 0,
  new_to_dataset: 1,
  ambiguous: 2,
  same_program: 3,
};

const rosterStatuses = new Set<RosterStatus>([
  "all",
  "same_program",
  "different_program",
  "new_to_dataset",
  "ambiguous",
]);
const rosterSorts = new Set<RosterSortKey>([
  "status",
  "name",
  "program",
  "prior",
  "workload",
  "prior_ppg",
  "prior_rpg",
  "prior_apg",
  "prior_ts",
  "prior_efg",
]);

/** Read the roster-observation controls from a stable, shareable URL. */
export function parseRosterFilters(search: string): RosterFilters {
  const params = new URLSearchParams(search);
  const season = params.get("rosterSeason");
  const status = params.get("rosterStatus") as RosterStatus | null;
  const sort = params.get("rosterSort") as RosterSortKey | null;
  const page = Number(params.get("rosterPage") || 0);
  return {
    season: season === "2026" ? "2026" : "2027",
    q: params.get("rosterQ") || "",
    position: params.get("rosterPosition") || "",
    classYear: params.get("rosterClass") || "",
    status: status && rosterStatuses.has(status) ? status : "all",
    sort: sort && rosterSorts.has(sort) ? sort : "status",
    page: Number.isInteger(page) && page > 0 && page <= 250 ? page : 0,
    picks: [...new Set(params.getAll("rosterPick").filter((v) => /^[1-9]\d{0,14}$/.test(v)))].slice(0, 12),
  };
}

/** Serialize non-default roster-observation controls for a compact handoff URL. */
export function rosterFilterSearch(filters: RosterFilters) {
  const params = new URLSearchParams();
  if (filters.season !== "2027") params.set("rosterSeason", filters.season);
  if (filters.q) params.set("rosterQ", filters.q);
  if (filters.position) params.set("rosterPosition", filters.position);
  if (filters.classYear) params.set("rosterClass", filters.classYear);
  if (filters.status !== "all") params.set("rosterStatus", filters.status);
  if (filters.sort !== "status") params.set("rosterSort", filters.sort);
  if (filters.page) params.set("rosterPage", String(filters.page));
  filters.picks.slice(0, 12).forEach((id) => params.append("rosterPick", id));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Return stable source labels for select controls without inventing categories. */
export function rosterFilterOptions(rows: BBRoster[]) {
  return {
    positions: [...new Set(rows.map((row) => row.position).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b)),
    classes: [...new Set(rows.map((row) => row.class_year).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b)),
  };
}

/** Sort roster observations for recruiting review without mutating the release. */
export function sortRosterObservations(
  rows: BBRoster[],
  key: RosterSortKey,
): BBRoster[] {
  return [...rows].sort((a, b) => {
    if (key === "status") {
      const delta = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      if (delta) return delta;
    } else if (key === "name") {
      const delta = a.name.localeCompare(b.name);
      if (delta) return delta;
    } else if (key === "program") {
      const delta = a.team.localeCompare(b.team);
      if (delta) return delta;
    } else if (key === "prior") {
      const delta = b.previous_teams.length - a.previous_teams.length;
      if (delta) return delta;
    } else if (key === "workload") {
      const delta =
        (b.prior_production?.minutes ?? -1) -
        (a.prior_production?.minutes ?? -1);
      if (delta) return delta;
    } else if (
      key === "prior_ppg" ||
      key === "prior_rpg" ||
      key === "prior_apg" ||
      key === "prior_ts" ||
      key === "prior_efg"
    ) {
      const metric =
        key === "prior_ppg"
          ? "ppg"
          : key === "prior_rpg"
            ? "rpg"
            : key === "prior_apg"
              ? "apg"
              : key === "prior_ts"
                ? "ts"
                : "efg";
      const av = a.prior_production?.[metric] ?? null;
      const bv = b.prior_production?.[metric] ?? null;
      if (av == null && bv != null) return 1;
      if (av != null && bv == null) return -1;
      if (av != null && bv != null && bv !== av) return bv - av;
    }
    return (
      a.name.localeCompare(b.name) ||
      a.team.localeCompare(b.team) ||
      a.id.localeCompare(b.id)
    );
  });
}
