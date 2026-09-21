import type { BBRoster, BBRosters } from "./basketball-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validRosterPlayer(value: unknown): value is BBRoster {
  if (!isRecord(value)
    || typeof value.id !== "string" || value.id.trim() === ""
    || typeof value.name !== "string" || value.name.trim() === ""
    || typeof value.team_id !== "string" || value.team_id.trim() === ""
    || typeof value.team !== "string" || value.team.trim() === ""
    || !Array.isArray(value.previous_teams)
    || !value.previous_teams.every((team) => typeof team === "string")
    || typeof value.status !== "string" || value.status.trim() === "") return false;
  if (value.position !== null && value.position !== undefined && typeof value.position !== "string") return false;
  if (value.class_year !== null && value.class_year !== undefined && typeof value.class_year !== "string") return false;
  if (value.height !== null && value.height !== undefined && typeof value.height !== "string") return false;
  if (value.weight !== null && value.weight !== undefined && typeof value.weight !== "string") return false;
  if (value.source_url !== null && value.source_url !== undefined && typeof value.source_url !== "string") return false;
  if (value.prior_production !== null && value.prior_production !== undefined) {
    if (!isRecord(value.prior_production)
      || !finiteNonNegative(value.prior_production.games)
      || !finiteNonNegative(value.prior_production.minutes)
      || !Array.isArray(value.prior_production.teams)
      || !value.prior_production.teams.every((team) => typeof team === "string")) return false;
  }
  return true;
}

/**
 * Validate the live roster observation before it can replace the reviewed
 * bundled release. The API is source evidence, so a malformed response is
 * withheld as a whole; silently dropping bad rows would change denominators
 * and could make a partial roster look complete.
 */
export function parseRecruitingFitRosterPayload(payload: unknown, expectedSeason = 2027): BBRosters | null {
  if (!isRecord(payload)
    || payload.season !== expectedSeason
    || payload.previous_season !== expectedSeason - 1
    || !nonNegativeInteger(payload.teams_observed)
    || !nonNegativeInteger(payload.players_observed)
    || !nonNegativeInteger(payload.prior_players_not_observed)
    || !isRecord(payload.status_counts)
    || !Array.isArray(payload.players)) return null;
  if (!Object.values(payload.status_counts).every(finiteNonNegative)) return null;
  // The fit board calculates cohort percentiles. A bounded API page would
  // make those ranks look complete while silently omitting candidates, so a
  // declared truncation is withheld as a whole. Optional count fields are
  // checked when present to keep future endpoint changes fail-closed.
  if (payload.players_returned !== undefined
    && (!nonNegativeInteger(payload.players_returned) || payload.players_returned !== payload.players.length)) return null;
  if (payload.players_available !== undefined && !nonNegativeInteger(payload.players_available)) return null;
  if (payload.players_available !== undefined && payload.players_available < payload.players.length) return null;
  if (payload.players_truncated !== undefined && typeof payload.players_truncated !== "boolean") return null;
  if (payload.players_truncated === true
    || (payload.players_available !== undefined && payload.players_available !== payload.players.length)
    || (payload.players_available !== undefined && payload.players_truncated !== (payload.players.length < payload.players_available))) return null;
  const ids = new Set<string>();
  for (const player of payload.players) {
    if (!validRosterPlayer(player)) return null;
    if (ids.has(player.id)) return null;
    ids.add(player.id);
  }
  const statusTotal = Object.values(payload.status_counts).reduce<number>((sum, value) => sum + Number(value), 0);
  if (payload.players_observed !== ids.size || statusTotal !== payload.players.length) return null;
  if (payload.source !== null && payload.source !== undefined) {
    if (!isRecord(payload.source) || typeof payload.source.dataset !== "string" || payload.source.dataset.trim() === "") return null;
    for (const key of ["url", "fetched_at"]) {
      const value = payload.source[key];
      if (value !== null && value !== undefined && typeof value !== "string") return null;
    }
    const digest = payload.source.sha256;
    if (digest !== null && digest !== undefined && (typeof digest !== "string" || !/^[a-f0-9]{64}$/i.test(digest))) return null;
  }
  return payload as unknown as BBRosters;
}

export type RecruitingFitSourceReceipt = {
  dataset: string;
  fetchedAt: string | null;
  sha256: string;
};

/** Normalize a receipt before the fit board describes an edition as verified. */
export function recruitingFitSourceReceipt(rosters: BBRosters): RecruitingFitSourceReceipt | null {
  const source = rosters.source;
  const sha256 = source?.sha256?.trim().toLowerCase() || "";
  if (!source || source.dataset.trim() !== "rosters" || !/^[a-f0-9]{64}$/.test(sha256)) return null;
  const fetchedAt = source.fetched_at?.trim() || null;
  if (fetchedAt != null && !Number.isFinite(Date.parse(fetchedAt))) return null;
  return { dataset: source.dataset.trim(), fetchedAt, sha256 };
}

export type RecruitingFitCoverage = {
  listedPlayers: number;
  priorProductionRows: number;
  priorProductionMissing: number;
  teamsObserved: number | null;
};

/** Count only fields present on the retained player rows; no missing value is inferred. */
export function recruitingFitCoverage(rosters: BBRosters): RecruitingFitCoverage {
  const listedPlayers = rosters.players.length;
  const priorProductionRows = rosters.players.filter((player) => player.prior_production != null).length;
  const teamsObserved = Number.isSafeInteger(rosters.teams_observed) && rosters.teams_observed >= 0
    ? rosters.teams_observed
    : null;
  return {
    listedPlayers,
    priorProductionRows,
    priorProductionMissing: listedPlayers - priorProductionRows,
    teamsObserved,
  };
}

export type FitRole = "guard" | "wing" | "big" | "any";
export type FitFocus = "creation" | "shooting" | "rebounding" | "defense" | "workload";

export type FitTeam = {
  id: string;
  name: string;
  rank: number;
  adj_net: number;
  /** Retained prior-season team outlook fields; never treated as a current need. */
  archivedNeeds?: string[];
  archivedNeedsSeason?: string | null;
};

export type ArchivedNeedStatus = "match" | "not_recorded" | "unavailable";

/**
 * Compare a candidate's normalized role with source-recorded positional needs.
 * An empty list means the archived outlook recorded no need; an omitted list
 * means the outlook is unavailable. This is context for review, not a fit score.
 */
export function archivedNeedStatus(
  role: FitRole | "unknown",
  needs: string[] | undefined,
): ArchivedNeedStatus {
  if (!needs) return "unavailable";
  if (role === "unknown") return "not_recorded";
  const needRoles = new Set(needs.map(positionRole).filter((value): value is Exclude<FitRole, "any"> => value !== "unknown" && value !== "any"));
  return needRoles.has(role as Exclude<FitRole, "any">) ? "match" : "not_recorded";
}

export type FitRow = {
  player: BBRoster;
  role: FitRole | "unknown";
  /** Ordinal within the complete role/workload-qualified cohort, before search filtering. */
  cohortRank: number;
  cohortTotal: number;
  score: number;
  skillPercentile: number | null;
  skillComponents: number;
  skillComponentTotal: number;
  skillBreakdown: Array<{ key: ProductionKey; weight: number; value: number | null; percentile: number | null }>;
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

export type ProductionKey = "apg" | "ppg" | "ts" | "efg" | "ft_pct" | "rpg" | "orpg" | "drpg" | "spg" | "bpg" | "minutes" | "mpg";

export const fitMetricLabels: Record<ProductionKey, string> = {
  apg: "APG", ppg: "PPG", ts: "TS%", efg: "eFG%", ft_pct: "FT%", rpg: "RPG", orpg: "ORB/G", drpg: "DRB/G", spg: "SPG", bpg: "BPG", minutes: "Prior minutes", mpg: "MPG",
};

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

function skillPercentile(player: BBRoster, pool: BBRoster[], focus: FitFocus): { score: number | null; primary: number | null; components: number; total: number; breakdown: Array<{ key: ProductionKey; weight: number; value: number | null; percentile: number | null }> } {
  const metrics = focusMetrics[focus];
  let weighted = 0;
  let weight = 0;
  let components = 0;
  const breakdown = metrics.map(([key, metricWeight]) => {
    const values = pool.map((row) => value(row, key)).filter((v): v is number => v != null);
    const current = value(player, key);
    const rank = percentile(values, current);
    if (rank != null) {
      weighted += rank * metricWeight;
      weight += metricWeight;
      components += 1;
    }
    return { key, weight: metricWeight, value: current, percentile: rank == null ? null : Math.round(rank * 1000) / 10 };
  });
  return { score: weight ? weighted / weight : null, primary: value(player, metrics[0][0]), components, total: metrics.length, breakdown };
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
      skillBreakdown: skill.breakdown,
      workloadPercentile: workloadPercentile == null ? null : Math.round(workloadPercentile * 1000) / 10,
      primaryValue: skill.primary,
    };
  });
  const ordered = scored
    .sort((a, b) => b.score - a.score || (b.player.prior_production?.minutes || 0) - (a.player.prior_production?.minutes || 0) || a.player.name.localeCompare(b.player.name))
    .map((row, index) => ({ ...row, cohortRank: index + 1, cohortTotal: scored.length }));
  return ordered
    .filter((row) => !query || `${row.player.name} ${row.player.team} ${row.player.previous_teams.join(" ")}`.toLowerCase().includes(query));
}
