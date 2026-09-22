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
  /** Provider display labels aligned to keys when the response supplied them. */
  labels?: string[];
  stats: string[];
};

export type LowerFootballPlayerArchive = {
  schema_version: 1;
  sport: "football";
  gender: "men";
  season: number;
  generated_at: string;
  scope: string;
  source_policy: string;
  source: {
    publisher: string;
    scoreboard_url: string;
    summary_url_template: string;
    team_url_template: string;
    receipt_count: number;
    receipt_sha256: string;
  };
  coverage: {
    events_discovered: number;
    events_with_d2_d3_team: number;
    games: number;
    player_rows: number;
    players: number;
    teams: number;
    rows_by_division: Record<"d2" | "d3", number>;
    players_by_division: Record<"d2" | "d3", number>;
  };
  receipts: Array<{ url: string; fetched_at: string; sha256: string }>;
  games: Array<{
    game_id: string;
    date: string | null;
    name: string | null;
    status: string | null;
    home_team_id: string | null;
    away_team_id: string | null;
  }>;
  rows: LowerFootballRawRow[];
};

const archiveDivisions = ["d2", "d3"] as const;
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const dateString = (value: unknown) => value == null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));

function validLowerPlayerRow(value: unknown, season: number, gameIds: ReadonlySet<string>): value is LowerFootballRawRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  // Provider values are positionally paired with keys. A mismatch makes the
  // source field identity ambiguous, so reject the row before display,
  // ranking, or export instead of shifting or silently dropping values.
  return row.season === season
    && (row.division === "d2" || row.division === "d3")
    && text(row.game_id) && gameIds.has(row.game_id)
    && text(row.team_id) && text(row.athlete_id) && text(row.athlete)
    && text(row.category) && Array.isArray(row.keys) && row.keys.length > 0
    && row.keys.every(text) && new Set(row.keys).size === row.keys.length
    && Array.isArray(row.stats) && row.stats.length === row.keys.length
    && row.stats.every((item) => typeof item === "string")
    && (row.labels == null || (Array.isArray(row.labels) && row.labels.every((item) => typeof item === "string")))
    && dateString(row.date);
}

/**
 * Validate the lower-division player release before it becomes a ranking
 * cohort. Counts and identities are checked against the retained rows; the
 * receipt digest binds the individual summary responses to this edition.
 */
export function validateLowerFootballPlayerArchive(value: unknown): LowerFootballPlayerArchive {
  if (!value || typeof value !== "object") throw new Error("Lower-division football player archive is malformed.");
  const raw = value as Record<string, unknown>;
  const source = raw.source as Record<string, unknown> | undefined;
  const coverage = raw.coverage as Record<string, unknown> | undefined;
  if (raw.schema_version !== 1 || raw.sport !== "football" || raw.gender !== "men"
    || !integer(raw.season) || !text(raw.generated_at) || Number.isNaN(Date.parse(raw.generated_at as string))
    || !text(raw.scope) || !text(raw.source_policy) || !source || !coverage
    || !text(source.publisher) || !text(source.scoreboard_url) || !text(source.summary_url_template)
    || !text(source.team_url_template) || !integer(source.receipt_count) || !sha256(source.receipt_sha256)) {
    throw new Error("Lower-division football player archive has an unsupported edition.");
  }
  const receipts = Array.isArray(raw.receipts) ? raw.receipts.filter((item): item is { url: string; fetched_at: string; sha256: string } => {
    if (!item || typeof item !== "object") return false;
    const receipt = item as Record<string, unknown>;
    return text(receipt.url) && text(receipt.fetched_at) && !Number.isNaN(Date.parse(receipt.fetched_at as string)) && sha256(receipt.sha256);
  }) : [];
  if (receipts.length !== source.receipt_count || receipts.length === 0
    || receipts.some((receipt) => !sha256(receipt.sha256))) {
    throw new Error("Lower-division football player archive has incomplete source receipts.");
  }
  // The builder computes the aggregate digest from sorted response hashes.
  // The static client validates the digest shape and every receipt identity;
  // the builder-side publication check remains authoritative for the value.
  const gamesRaw = Array.isArray(raw.games) ? raw.games : [];
  const games = gamesRaw.filter((item): item is LowerFootballPlayerArchive["games"][number] => {
    if (!item || typeof item !== "object") return false;
    const game = item as Record<string, unknown>;
    return text(game.game_id) && dateString(game.date)
      && (game.name == null || typeof game.name === "string")
      && (game.status == null || typeof game.status === "string")
      && (game.home_team_id == null || text(game.home_team_id))
      && (game.away_team_id == null || text(game.away_team_id));
  });
  if (games.length !== gamesRaw.length || games.length !== coverage.games) {
    throw new Error("Lower-division football player archive has invalid game coverage.");
  }
  const gameIds = new Set(games.map((game) => game.game_id));
  if (gameIds.size !== games.length) throw new Error("Lower-division football player archive has duplicate game IDs.");
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : [];
  const rows = rowsRaw.filter((item): item is LowerFootballRawRow => validLowerPlayerRow(item, raw.season as number, gameIds));
  if (rows.length !== rowsRaw.length || rows.length !== coverage.player_rows) {
    throw new Error("Lower-division football player archive has invalid player rows.");
  }
  const rowsByDivision = Object.fromEntries(archiveDivisions.map((division) => [division, rows.filter((row) => row.division === division).length])) as Record<"d2" | "d3", number>;
  const playersByDivision = Object.fromEntries(archiveDivisions.map((division) => [division, new Set(rows.filter((row) => row.division === division).map((row) => row.athlete_id)).size])) as Record<"d2" | "d3", number>;
  const rawRowsByDivision = coverage.rows_by_division as Record<string, unknown> | undefined;
  const rawPlayersByDivision = coverage.players_by_division as Record<string, unknown> | undefined;
  if (!archiveDivisions.every((division) => rawRowsByDivision && rawPlayersByDivision
    && integer(rawRowsByDivision[division]) && integer(rawPlayersByDivision[division])
    && rawRowsByDivision[division] === rowsByDivision[division]
    && rawPlayersByDivision[division] === playersByDivision[division])
    || coverage.events_discovered == null || coverage.events_with_d2_d3_team == null
    || !integer(coverage.events_discovered) || !integer(coverage.events_with_d2_d3_team)
    || !integer(coverage.players) || !integer(coverage.teams)
    || coverage.players !== new Set(rows.map((row) => row.athlete_id)).size
    || coverage.teams !== new Set(rows.map((row) => row.team_id)).size) {
    throw new Error("Lower-division football player archive coverage does not match its rows.");
  }
  return {
    schema_version: 1,
    sport: "football",
    gender: "men",
    season: raw.season,
    generated_at: raw.generated_at,
    scope: raw.scope,
    source_policy: raw.source_policy,
    source: source as LowerFootballPlayerArchive["source"],
    coverage: {
      events_discovered: coverage.events_discovered as number,
      events_with_d2_d3_team: coverage.events_with_d2_d3_team as number,
      games: coverage.games as number,
      player_rows: coverage.player_rows as number,
      players: coverage.players as number,
      teams: coverage.teams as number,
      rows_by_division: rowsByDivision,
      players_by_division: playersByDivision,
    },
    receipts,
    games,
    rows,
  };
}

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

export type LowerFootballPlayerSelection = {
  athlete_id: string;
  team_id: string;
  category: LowerFootballCategory;
};

const selectionToken = (value: string | null) =>
  value != null && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;

/**
 * Read a lower-division player detail target from a shareable URL.
 * Athlete and team IDs remain separate because an athlete can have more than
 * one team row in a release. Invalid or incomplete targets fail closed.
 */
export function parseLowerFootballPlayerSelection(search: string): LowerFootballPlayerSelection | null {
  const params = new URLSearchParams(search);
  const athleteId = selectionToken(params.get("player"));
  const teamId = selectionToken(params.get("team"));
  const category = params.get("category");
  if (!athleteId || !teamId || !lowerFootballCategories.some((item) => item.key === category)) return null;
  return { athlete_id: athleteId, team_id: teamId, category: category as LowerFootballCategory };
}

/**
 * Preserve existing scope/search controls while adding or removing one exact
 * lower-division player target. The returned query is suitable for history
 * state or a normal anchor URL.
 */
export function lowerFootballPlayerSelectionSearch(
  search: string,
  selection: LowerFootballPlayerSelection | null,
) {
  const params = new URLSearchParams(search);
  if (!selection) {
    params.delete("player");
    params.delete("team");
    params.delete("category");
  } else {
    params.set("player", selection.athlete_id);
    params.set("team", selection.team_id);
    params.set("category", selection.category);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

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
  /** The observed category total divided by distinct retained game IDs. */
  per_game: number;
  metrics: Record<string, number>;
};

export type LowerFootballRankingBasis = "total" | "per_game";

const finite = (value: number) => Number.isFinite(value);

/**
 * Return every retained provider metric represented in a ranked cohort.
 * Different player rows can carry different source fields, so a first-row
 * key list would silently omit columns from later rows during export.
 */
export function lowerFootballMetricKeys(
  players: readonly Pick<LowerFootballPlayer, "metrics">[],
): string[] {
  return [...new Set(players.flatMap((player) => Object.keys(player.metrics)))].sort((left, right) => left.localeCompare(right));
}

/**
 * ESPN lower-division boxes can contain a synthetic ``Team`` row with a
 * negative ID for team totals. Keep that row in the raw archive for audit and
 * export, but never let it become a player in a ranking cohort.
 */
export function isRankableLowerFootballPlayer(
  row: Pick<LowerFootballRawRow, "athlete_id" | "athlete">,
): boolean {
  const name = String(row.athlete || "").trim().toLowerCase();
  const id = String(row.athlete_id || "").trim();
  return id.length > 0
    && id !== "0"
    && !/^-[0-9]+$/.test(id)
    && name !== "team"
    && name !== "team total"
    && name !== "total";
}

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
    if (!isRankableLowerFootballPlayer(row)) continue;
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
      per_game: 0,
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
      per_game: 0,
    }))
    .map((player) => ({
      ...player,
      per_game: player.games > 0 ? player.primary / player.games : 0,
    }))
    .filter((player) => player.primary > 0)
    .sort((left, right) => right.primary - left.primary || left.athlete.localeCompare(right.athlete) || left.athlete_id.localeCompare(right.athlete_id));
}

/**
 * Pick the published ranking value without turning a missing game into a
 * zero-value performance. Both values are derived only from retained rows;
 * callers should display the basis alongside the rank.
 */
export function lowerFootballPlayerRankValue(
  player: Pick<LowerFootballPlayer, "primary" | "per_game">,
  basis: LowerFootballRankingBasis,
) {
  return basis === "per_game" ? player.per_game : player.primary;
}

/**
 * Return the retained source rows for one exact lower-division player scope.
 *
 * The archive has an athlete ID and team ID on every accepted row. Keep both
 * in the selector so a transfer or provider duplicate cannot merge two
 * programs, and keep the requested division/category in the predicate so a
 * detail panel can never leak a neighboring scope.
 */
export function lowerFootballSourceRows(
  rows: readonly LowerFootballRawRow[],
  division: "d2" | "d3",
  category: LowerFootballCategory,
  athleteId: string,
  teamId: string,
): LowerFootballRawRow[] {
  return rows
    .filter((row) => row.division === division
      && row.category === category
      && row.athlete_id === athleteId
      && row.team_id === teamId)
    .slice()
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || right.game_id.localeCompare(left.game_id));
}

export type LowerFootballGameContext = {
  game_id: string;
  date: string | null;
  name: string | null;
  status: string | null;
  team_side: "home" | "away" | "unknown";
  opponent_team_id: string | null;
};

/**
 * Join one retained player row to the published schedule by exact game ID.
 * Home/away and opponent are returned only when the row's exact team ID is a
 * published participant; an unlisted team never receives an inferred side.
 */
export function lowerFootballGameContext(
  games: ReadonlyArray<LowerFootballPlayerArchive["games"][number]>,
  row: Pick<LowerFootballRawRow, "game_id" | "team_id">,
): LowerFootballGameContext | null {
  const game = games.find((candidate) => candidate.game_id === row.game_id);
  if (!game) return null;
  const teamSide = row.team_id === game.home_team_id ? "home" : row.team_id === game.away_team_id ? "away" : "unknown";
  return {
    game_id: game.game_id,
    date: game.date,
    name: game.name,
    status: game.status,
    team_side: teamSide,
    opponent_team_id: teamSide === "home" ? game.away_team_id : teamSide === "away" ? game.home_team_id : null,
  };
}

/** Pair a retained source row's field names with its raw values for display. */
export function lowerFootballSourceFields(row: LowerFootballRawRow): Array<{ key: string; label: string; value: string | null }> {
  return row.keys.map((key, index) => ({
    key,
    label: row.labels?.[index] || key,
    value: row.stats[index] == null || row.stats[index] === "" ? null : String(row.stats[index]),
  }));
}

export type LowerFootballRawExport = {
  headers: string[];
  rows: Array<Array<string | number | null>>;
};

/**
 * Export every retained event row for one exact lower-division scope. The
 * athlete, team, and game IDs stay in the row so consumers can reproduce the
 * player/category aggregation without a name-based join.
 */
export function lowerFootballRawExport(
  rows: readonly LowerFootballRawRow[],
  division: "d2" | "d3",
): LowerFootballRawExport {
  const scoped = rows
    .filter((row) => row.division === division)
    .slice()
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || ""))
      || left.game_id.localeCompare(right.game_id)
      || left.athlete_id.localeCompare(right.athlete_id)
      || left.category.localeCompare(right.category));
  const fields = [...new Set(scoped.flatMap((row) => row.keys))].sort();
  const headers = ["Season", "Division", "Date", "Game ID", "Category", "Athlete", "Athlete ID", "Position", "Team", "Team ID", "Provider labels", ...fields];
  return {
    headers,
    rows: scoped.map((row) => {
      const values = new Map(row.keys.map((key, index) => [key, row.stats[index] == null || row.stats[index] === "" ? null : row.stats[index]]));
      return [
        row.season,
        row.division.toUpperCase(),
        row.date || null,
        row.game_id,
        row.category,
        row.athlete || null,
        row.athlete_id,
        row.position || null,
        row.team || null,
        row.team_id,
        row.labels?.length ? JSON.stringify(row.labels) : null,
        ...fields.map((field) => values.get(field) ?? null),
      ];
    }),
  };
}

export type LowerFootballSourceFieldCoverage = {
  key: string;
  label: string;
  categories: string[];
  source_rows: number;
  populated_values: number;
};

/**
 * Summarize the provider fields present in one exact lower-division archive.
 * This is a field-presence audit, not a derived statistic or cross-category
 * player join. Blank provider cells remain visible through populated_values.
 */
export function lowerFootballSourceFieldCoverage(
  rows: readonly LowerFootballRawRow[],
  division: "d2" | "d3",
): LowerFootballSourceFieldCoverage[] {
  const fields = new Map<string, LowerFootballSourceFieldCoverage>();
  for (const row of rows) {
    if (row.division !== division) continue;
    row.keys.forEach((key, index) => {
      const existing = fields.get(key) || {
        key,
        label: row.labels?.[index] || key,
        categories: [],
        source_rows: 0,
        populated_values: 0,
      };
      existing.source_rows += 1;
      if (row.stats[index] != null && row.stats[index].trim() !== "") existing.populated_values += 1;
      if (!existing.categories.includes(row.category)) existing.categories.push(row.category);
      fields.set(key, existing);
    });
  }
  return [...fields.values()]
    .map((field) => ({ ...field, categories: [...field.categories].sort() }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function lowerFootballCategoryDefinition(category: LowerFootballCategory) {
  return lowerFootballCategories.find((item) => item.key === category) || lowerFootballCategories[0];
}
