import type { BBRoster } from "./basketball-types";

export type RosterSortKey = "status" | "name" | "program" | "prior" | "workload";

const statusOrder: Record<string, number> = {
  different_program: 0,
  new_to_dataset: 1,
  ambiguous: 2,
  same_program: 3,
};

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
    }
    return (
      a.name.localeCompare(b.name) ||
      a.team.localeCompare(b.team) ||
      a.id.localeCompare(b.id)
    );
  });
}
