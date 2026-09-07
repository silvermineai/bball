import type { BBTeam } from "./basketball-types";

export type RatingSortKey =
  | "adj_net"
  | "adj_off"
  | "adj_def"
  | "adj_tempo"
  | "sos"
  | "efg"
  | "tov_rate"
  | "orb_rate"
  | "ft_rate"
  | "three_rate";

const lowerIsBetter = new Set<RatingSortKey>(["adj_def", "tov_rate"]);

/** Sort the published rating board without mutating its source release. */
export function sortTeamRatings(rows: BBTeam[], key: RatingSortKey): BBTeam[] {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av != null && bv != null && av !== bv) {
      const delta = lowerIsBetter.has(key) ? av - bv : bv - av;
      if (delta) return delta;
    }
    return a.rank - b.rank || a.name.localeCompare(b.name);
  });
}
