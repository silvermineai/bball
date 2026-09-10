import type { BBRoster } from "./basketball-types";

export type FitRole = "guard" | "wing" | "big" | "any";
export type FitFocus = "creation" | "shooting" | "rebounding" | "defense" | "workload";

export type FitTeam = {
  id: string;
  name: string;
  rank: number;
  adj_net: number;
};

export type FitRow = {
  player: BBRoster;
  role: FitRole | "unknown";
  score: number;
  skillPercentile: number | null;
  skillComponents: number;
  skillComponentTotal: number;
  workloadPercentile: number | null;
  primaryValue: number | null;
};

export type RoleSummary = {
  role: Exclude<FitRole, "any">;
  listed: number;
  priorMinutes: number;
  returningMinutes: number;
  incomingMinutes: number;
  unclassifiedMinutes: number;
  returningShare: number | null;
  incomingShare: number | null;
  unclassifiedShare: number | null;
  topPlayers: BBRoster[];
};

const roleOrder: Array<Exclude<FitRole, "any">> = ["guard", "wing", "big"];

export function positionRole(position: string | null | undefined): FitRole | "unknown" {
  const value = (position || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (["g", "pg", "sg", "guard", "guards"].includes(value) || value.includes("guard")) return "guard";
  if (["f", "sf", "pf", "forward", "forwards", "wing"].includes(value) || value.includes("forward") || value.includes("wing")) return "wing";
  if (["c", "center", "centers", "big"].includes(value) || value.includes("center")) return "big";
  return "unknown";
}

export const roleLabels: Record<FitRole, string> = {
  any: "Any role",
  guard: "Guard",
  wing: "Wing / forward",
  big: "Big / center",
};

export const focusLabels: Record<FitFocus, string> = {
  creation: "Creation",
  shooting: "Shooting",
  rebounding: "Rebounding",
  defense: "Defensive events",
  workload: "Workload",
};

export const focusDescriptions: Record<FitFocus, string> = {
  creation: "Assist and scoring percentiles, with recorded workload as context.",
  shooting: "True-shooting, effective-FG and free-throw accuracy percentiles, with volume as context.",
  rebounding: "Offensive and defensive rebound rates, with minutes per game as workload context.",
  defense: "Steal and block event percentiles, with workload as context.",
  workload: "Prior total minutes and minutes-per-game percentiles.",
};

type ProductionKey = "apg" | "ppg" | "ts" | "efg" | "ft_pct" | "rpg" | "orpg" | "drpg" | "spg" | "bpg" | "minutes" | "mpg";

const focusMetrics: Record<FitFocus, Array<[ProductionKey, number]>> = {
  creation: [["apg", 0.6], ["ppg", 0.4]],
  shooting: [["ts", 0.45], ["efg", 0.35], ["ft_pct", 0.2]],
  rebounding: [["orpg", 0.4], ["drpg", 0.4], ["mpg", 0.2]],
  defense: [["spg", 0.6], ["bpg", 0.4]],
  workload: [["minutes", 0.6], ["mpg", 0.4]],
};

function value(player: BBRoster, key: ProductionKey): number | null {
  const production = player.prior_production;
  if (!production) return null;
  const raw = key === "minutes" ? production.minutes : production[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function percentile(values: number[], target: number | null): number | null {
  if (target == null || values.length < 2) return target == null ? null : 0.5;
  let below = 0;
  for (const candidate of values) if (candidate < target) below += 1;
  return below / (values.length - 1);
}

function skillPercentile(player: BBRoster, pool: BBRoster[], focus: FitFocus): { score: number | null; primary: number | null; components: number; total: number } {
  const metrics = focusMetrics[focus];
  let weighted = 0;
  let weight = 0;
  let components = 0;
  for (const [key, metricWeight] of metrics) {
    const values = pool.map((row) => value(row, key)).filter((v): v is number => v != null);
    const current = value(player, key);
    const rank = percentile(values, current);
    if (rank != null) {
      weighted += rank * metricWeight;
      weight += metricWeight;
      components += 1;
    }
  }
  return { score: weight ? weighted / weight : null, primary: value(player, metrics[0][0]), components, total: metrics.length };
}

export function buildRoleSummaries(players: BBRoster[], teamId: string): RoleSummary[] {
  return roleOrder.map((role) => {
    const rows = players.filter((player) => player.team_id === teamId && positionRole(player.position) === role);
    const priorMinutes = rows.reduce((sum, row) => sum + (row.prior_production?.minutes || 0), 0);
    const returningMinutes = rows.reduce((sum, row) => sum + (row.status === "same_program" ? row.prior_production?.minutes || 0 : 0), 0);
    const incomingMinutes = rows.reduce((sum, row) => sum + (row.status === "different_program" ? row.prior_production?.minutes || 0 : 0), 0);
    const unclassifiedMinutes = Math.max(0, priorMinutes - returningMinutes - incomingMinutes);
    return {
      role,
      listed: rows.length,
      priorMinutes,
      returningMinutes,
      incomingMinutes,
      unclassifiedMinutes,
      returningShare: priorMinutes > 0 ? returningMinutes / priorMinutes : null,
      incomingShare: priorMinutes > 0 ? incomingMinutes / priorMinutes : null,
      unclassifiedShare: priorMinutes > 0 ? unclassifiedMinutes / priorMinutes : null,
      topPlayers: [...rows].sort((a, b) => (b.prior_production?.minutes || 0) - (a.prior_production?.minutes || 0)).slice(0, 3),
    };
  });
}

/**
 * Put the role with the most source-listed workload that has no clear
 * movement classification first. This is a review queue for staff, never a
 * departure estimate or a recruiting grade.
 */
export function prioritizeRoleSummaries(summaries: RoleSummary[]): RoleSummary[] {
  return [...summaries].sort(
    (a, b) => b.unclassifiedMinutes - a.unclassifiedMinutes
      || b.priorMinutes - a.priorMinutes
      || roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role),
  );
}

export function buildRecruitingFit(
  players: BBRoster[],
  options: { teamId: string; role: FitRole; focus: FitFocus; minimumMinutes: number; query?: string },
): FitRow[] {
  const eligible = players.filter((player) => {
    if (player.team_id === options.teamId || !player.prior_production) return false;
    if (player.prior_production.minutes < options.minimumMinutes) return false;
    if (options.role !== "any" && positionRole(player.position) !== options.role) return false;
    return true;
  });
  const query = (options.query || "").trim().toLowerCase();
  const scored = eligible.map((player) => {
    const skill = skillPercentile(player, eligible, options.focus);
    const minutes = eligible.map((row) => value(row, "minutes")).filter((v): v is number => v != null);
    const workloadPercentile = percentile(minutes, value(player, "minutes"));
    const score = skill.score == null || workloadPercentile == null
      ? 0
      : Math.round((skill.score * 0.7 + workloadPercentile * 0.3) * 1000) / 10;
    return {
      player,
      role: positionRole(player.position),
      score,
      skillPercentile: skill.score == null ? null : Math.round(skill.score * 1000) / 10,
      skillComponents: skill.components,
      skillComponentTotal: skill.total,
      workloadPercentile: workloadPercentile == null ? null : Math.round(workloadPercentile * 1000) / 10,
      primaryValue: skill.primary,
    } satisfies FitRow;
  });
  return scored
    .filter((row) => !query || `${row.player.name} ${row.player.team} ${row.player.previous_teams.join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) => b.score - a.score || (b.player.prior_production?.minutes || 0) - (a.player.prior_production?.minutes || 0) || a.player.name.localeCompare(b.player.name));
}
