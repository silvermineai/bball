import type { BBImpact } from "./basketball-types";

export type ImpactSortKey =
  | "rank"
  | "orapm"
  | "drapm"
  | "rapm_net"
  | "off_poss"
  | "def_poss";

const value = (row: BBImpact, key: ImpactSortKey) =>
  key === "rank" ? row.rank : row[key];

/** Sort impact rows without mutating the release or hiding missing values. */
export function sortImpactRows(
  rows: BBImpact[],
  key: ImpactSortKey,
): BBImpact[] {
  return [...rows].sort((a, b) => {
    const av = value(a, key), bv = value(b, key);
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av != null && bv != null && av !== bv) {
      return key === "rank" ? av - bv : bv - av;
    }
    if (key !== "rank") {
      const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
      const br = b.rank ?? Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
    }
    return a.player.localeCompare(b.player) || a.player_id.localeCompare(b.player_id);
  });
}
