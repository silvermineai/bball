export type LowerFootballRawRow = {
  season: number;
  division: "d2" | "d3";
  game_id: string;
  date?: string;
  team_id: string;
  team?: string | null;
  athlete_id: string;
  athlete?: string | null;
  position?: string | null;
  category: string;
  keys: string[];
  stats: string[];
};

export type LowerFootballCategory =
  | "passing"
  | "rushing"
  | "receiving"
  | "defensive"
  | "interceptions"
  | "fumbles"
  | "kicking"
  | "punting"
  | "kickReturns"
  | "puntReturns";

export const lowerFootballCategories: ReadonlyArray<{
  key: LowerFootballCategory;
  label: string;
  metric: string;
  unit: string;
}> = [
  { key: "passing", label: "Passing", metric: "passingYards", unit: "yards" },
  { key: "rushing", label: "Rushing", metric: "rushingYards", unit: "yards" },
  { key: "receiving", label: "Receiving", metric: "receivingYards", unit: "yards" },
  { key: "defensive", label: "Defense", metric: "totalTackles", unit: "tackles" },
  { key: "interceptions", label: "Interceptions", metric: "interceptions", unit: "INT" },
  { key: "fumbles", label: "Fumbles recovered", metric: "fumblesRecovered", unit: "recoveries" },
  { key: "kicking", label: "Kicking points", metric: "totalKickingPoints", unit: "points" },
  { key: "punting", label: "Punting", metric: "puntYards", unit: "yards" },
  { key: "kickReturns", label: "Kick returns", metric: "kickReturnYards", unit: "yards" },
  { key: "puntReturns", label: "Punt returns", metric: "puntReturnYards", unit: "yards" },
];

export type LowerFootballPlayer = {
  athlete_id: string;
  athlete: string;
  team_id: string;
  team: string;
  division: "d2" | "d3";
  position: string | null;
  category: LowerFootballCategory;
  games: number;
  source_rows: number;
  primary: number;
  metrics: Record<string, number>;
};

const finite = (value: number) => Number.isFinite(value);

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && finite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "—" || normalized === "-" || normalized.toLowerCase() === "n/a") return null;
  const parsed = Number(normalized);
  return finite(parsed) ? parsed : null;
}

function addMetric(metrics: Record<string, number>, key: string, value: unknown) {
  const parsed = numberValue(value);
  if (parsed != null) metrics[key] = (metrics[key] || 0) + parsed;
}

/** Aggregate only exact ESPN athlete IDs; names never form an identity join. */
export function aggregateLowerFootballPlayers(
  rows: readonly LowerFootballRawRow[],
  division: "d2" | "d3",
  category: LowerFootballCategory,
  query = "",
): LowerFootballPlayer[] {
  const definition = lowerFootballCategories.find((item) => item.key === category);
  if (!definition) return [];
  const needle = query.trim().toLowerCase();
  const grouped = new Map<string, LowerFootballPlayer & { game_ids: Set<string> }>();
  for (const row of rows) {
    if (row.division !== division || row.category !== category) continue;
    const name = String(row.athlete || "").trim();
    const team = String(row.team || "").trim();
    if (!row.athlete_id || !name || (needle && !`${name} ${team} ${row.team_id}`.toLowerCase().includes(needle))) continue;
    const id = `${row.athlete_id}:${row.team_id}:${division}:${category}`;
    const existing = grouped.get(id) || {
      athlete_id: row.athlete_id,
      athlete: name,
      team_id: row.team_id,
      team: team || "Team unavailable",
      division,
      position: row.position || null,
      category,
      games: 0,
      source_rows: 0,
      primary: 0,
      metrics: {},
      game_ids: new Set<string>(),
    };
    existing.source_rows += 1;
    existing.game_ids.add(row.game_id);
    existing.games = existing.game_ids.size;
    row.keys.forEach((key, index) => addMetric(existing.metrics, key, row.stats[index]));
    grouped.set(id, existing);
  }
  return [...grouped.values()]
    .map(({ game_ids: _gameIds, ...player }) => ({
      ...player,
      primary: player.metrics[definition.metric] || 0,
    }))
    .filter((player) => player.primary > 0)
    .sort((left, right) => right.primary - left.primary || left.athlete.localeCompare(right.athlete) || left.athlete_id.localeCompare(right.athlete_id));
}

export function lowerFootballCategoryDefinition(category: LowerFootballCategory) {
  return lowerFootballCategories.find((item) => item.key === category) || lowerFootballCategories[0];
}
