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
  | "prior_spg"
  | "prior_bpg"
  | "prior_ts"
  | "prior_efg"
  | "prior_three_pct"
  | "prior_ft_rate"
  | "prior_three_rate"
  | "prior_tov_rate"
  | "prior_bpm"
  | "prior_index";

export type RosterStatus =
  | "all"
  | "same_program"
  | "different_program"
  | "new_to_dataset"
  | "ambiguous";

type PriorProductionSort =
  | "prior_ppg"
  | "prior_rpg"
  | "prior_apg"
  | "prior_spg"
  | "prior_bpg"
  | "prior_ts"
  | "prior_efg"
  | "prior_three_pct"
  | "prior_ft_rate"
  | "prior_three_rate"
  | "prior_tov_rate"
  | "prior_bpm";
type PriorRateMetric =
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "ts"
  | "efg"
  | "three_pct"
  | "ft_rate"
  | "three_rate"
  | "tov_rate"
  | "box_bpm";

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
  "prior_spg",
  "prior_bpg",
  "prior_ts",
  "prior_efg",
  "prior_three_pct",
  "prior_ft_rate",
  "prior_three_rate",
  "prior_tov_rate",
  "prior_bpm",
  "prior_index",
]);

const indexMetrics = ["ppg", "rpg", "apg", "spg", "bpg", "ts", "efg"] as const;
type IndexMetric = (typeof indexMetrics)[number];
export type PriorProductionIndex = { score: number | null; components: number };

/**
 * Calculate a transparent, cohort-relative production index for recruiting
 * review. Each available rate is standardized within the visible rows and
 * averaged; no missing source field is converted to zero.
 */
export function priorProductionIndex(rows: BBRoster[]) {
  const moments = new Map<IndexMetric, { mean: number; sd: number }>();
  for (const metric of indexMetrics) {
    const values = rows
      .map((row) => row.prior_production?.[metric] ?? null)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;
    moments.set(metric, { mean, sd: Math.sqrt(variance) });
  }
  return new Map(rows.map((row) => {
    const values = indexMetrics.flatMap((metric) => {
      const value = row.prior_production?.[metric] ?? null;
      const moment = moments.get(metric)!;
      return value == null || !Number.isFinite(value) || moment.sd === 0
        ? []
        : [(value - moment.mean) / moment.sd];
    });
    return [`${row.id}-${row.team_id}`, { score: values.length >= 4 ? values.reduce((sum, value) => sum + value, 0) / values.length : null, components: values.length }];
  }));
}

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
  const index = key === "prior_index" ? priorProductionIndex(rows) : null;
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
    } else if (key.startsWith("prior_") && key !== "prior_index") {
      const metric = ({
        prior_ppg: "ppg",
        prior_rpg: "rpg",
        prior_apg: "apg",
        prior_spg: "spg",
        prior_bpg: "bpg",
        prior_ts: "ts",
        prior_efg: "efg",
        prior_three_pct: "three_pct",
        prior_ft_rate: "ft_rate",
        prior_three_rate: "three_rate",
        prior_tov_rate: "tov_rate",
        prior_bpm: "box_bpm",
      } as Record<PriorProductionSort, PriorRateMetric>)[key as PriorProductionSort];
      if (!metric) return 0;
      const av = a.prior_production?.[metric] ?? null;
      const bv = b.prior_production?.[metric] ?? null;
      if (av == null && bv != null) return 1;
      if (av != null && bv == null) return -1;
      if (av != null && bv != null && bv !== av) {
        return metric === "tov_rate" ? av - bv : bv - av;
      }
    } else if (key === "prior_index") {
      const av = index!.get(`${a.id}-${a.team_id}`)?.score ?? null;
      const bv = index!.get(`${b.id}-${b.team_id}`)?.score ?? null;
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
