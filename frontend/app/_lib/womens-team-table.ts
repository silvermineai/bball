export type WomensTeamStatMetadata = {
  label?: string;
  name?: string;
  description?: string;
};

export type WomensSourceTeam = {
  team_id: string;
  team: string;
  abbreviation?: string;
  stats: Record<string, number | null | undefined>;
  stat_metadata?: Record<string, WomensTeamStatMetadata>;
};

export type WomensTeamMetric = {
  key: string;
  label: string;
  name: string;
  description: string;
  unit?: "number" | "percent";
  derived?: boolean;
};

const derivedMetricDefinitions: Record<string, Omit<WomensTeamMetric, "key">> = {
  effectiveFieldGoalPct: {
    label: "eFG%",
    name: "Effective Field Goal Percentage",
    description: "Derived from recorded FGM, 3PM, and FGA: 100 × (FGM + 0.5 × 3PM) / FGA.",
    unit: "percent",
    derived: true,
  },
  trueShootingPct: {
    label: "TS%",
    name: "True Shooting Percentage",
    description: "Derived from recorded points, FGA, and FTA: 100 × PTS / (2 × (FGA + 0.475 × FTA)).",
    unit: "percent",
    derived: true,
  },
  threePointAttemptRate: {
    label: "3PA rate",
    name: "Three-Point Attempt Rate",
    description: "Derived from recorded 3PA and FGA: 100 × 3PA / FGA.",
    unit: "percent",
    derived: true,
  },
  freeThrowRate: {
    label: "FT rate",
    name: "Free-Throw Rate",
    description: "Derived from recorded FTA and FGA: 100 × FTA / FGA.",
    unit: "percent",
    derived: true,
  },
};

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const percentRatio = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator > 0 ? (numerator / denominator) * 100 : null;

/** Read a retained stat or derive a transparent shot-profile rate from retained totals. */
export function womensTeamMetricValue(team: WomensSourceTeam, metric: string): number | null {
  const recorded = team.stats[metric];
  if (finite(recorded)) return recorded;

  const stats = team.stats;
  const fgm = finite(stats.fieldGoalsMade) ? stats.fieldGoalsMade : null;
  const fga = finite(stats.fieldGoalsAttempted) ? stats.fieldGoalsAttempted : null;
  const threeMade = finite(stats.threePointFieldGoalsMade) ? stats.threePointFieldGoalsMade : null;
  const threeAttempted = finite(stats.threePointFieldGoalsAttempted) ? stats.threePointFieldGoalsAttempted : null;
  const points = finite(stats.points) ? stats.points : null;
  const freeThrowAttempts = finite(stats.freeThrowsAttempted) ? stats.freeThrowsAttempted : null;

  switch (metric) {
    case "effectiveFieldGoalPct":
      return fgm !== null && threeMade !== null && fga !== null && fga > 0
        ? ((fgm + 0.5 * threeMade) / fga) * 100
        : null;
    case "trueShootingPct":
      return points !== null && fga !== null && freeThrowAttempts !== null
        ? percentRatio(points, 2 * (fga + 0.475 * freeThrowAttempts))
        : null;
    case "threePointAttemptRate":
      return percentRatio(threeAttempted, fga);
    case "freeThrowRate":
      return percentRatio(freeThrowAttempts, fga);
    default:
      return null;
  }
}

/** Return every source metric represented by at least one retained team row. */
export function womensTeamMetrics(teams: readonly WomensSourceTeam[]): WomensTeamMetric[] {
  const metrics = new Map<string, WomensTeamMetric>();
  for (const team of teams) {
    for (const [key, value] of Object.entries(team.stat_metadata || {})) {
      if (!finite(team.stats[key]) || metrics.has(key)) continue;
      metrics.set(key, {
        key,
        label: value.label || key,
        name: value.name || key,
        description: value.description || "Recorded source team statistic.",
        unit: (value.label || "").includes("%") ? "percent" : "number",
      });
    }
  }
  for (const [key, definition] of Object.entries(derivedMetricDefinitions)) {
    if (metrics.has(key) || !teams.some((team) => finite(womensTeamMetricValue(team, key)))) continue;
    metrics.set(key, { key, ...definition });
  }
  return [...metrics.values()].sort((left, right) =>
    left.label.localeCompare(right.label) || left.key.localeCompare(right.key),
  );
}

/** Filter and order source rows without converting an absent stat to zero. */
export function filterWomensSourceTeams(
  teams: readonly WomensSourceTeam[],
  query: string,
  metric: string,
  minimumGames = 0,
  limit = 50,
): WomensSourceTeam[] {
  const needle = query.trim().toLowerCase();
  return teams
    .filter((team) => !needle || `${team.team} ${team.team_id} ${team.abbreviation || ""}`.toLowerCase().includes(needle))
    .filter((team) => {
      const games = team.stats.gamesPlayed;
      return finite(games) && games >= minimumGames;
    })
    .filter((team) => finite(womensTeamMetricValue(team, metric)))
    .sort((left, right) => {
      const rightValue = womensTeamMetricValue(right, metric);
      const leftValue = womensTeamMetricValue(left, metric);
      const difference = (rightValue as number) - (leftValue as number);
      return difference || left.team.localeCompare(right.team) || left.team_id.localeCompare(right.team_id);
    })
    .slice(0, limit);
}

export function formatWomensTeamStat(value: number | null | undefined, metric: WomensTeamMetric | undefined): string {
  if (!finite(value)) return "—";
  if (metric?.unit === "percent" || metric?.label.includes("%")) return `${value.toFixed(1)}%`;
  if (metric?.key === "gamesPlayed" || Number.isInteger(value)) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toFixed(2);
}
