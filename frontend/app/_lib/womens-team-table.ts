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
};

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

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
      });
    }
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
    .filter((team) => finite(team.stats[metric]))
    .sort((left, right) => {
      const difference = (right.stats[metric] as number) - (left.stats[metric] as number);
      return difference || left.team.localeCompare(right.team) || left.team_id.localeCompare(right.team_id);
    })
    .slice(0, limit);
}

export function formatWomensTeamStat(value: number | null | undefined, metric: WomensTeamMetric | undefined): string {
  if (!finite(value)) return "—";
  if (metric?.label.includes("%")) return `${value.toFixed(1)}%`;
  if (metric?.key === "gamesPlayed" || Number.isInteger(value)) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toFixed(2);
}
