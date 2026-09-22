export type WomensRankingRow = {
  rank: number;
  name: string;
  team: string;
  player_id: string;
};

export type WomensRankingBoardRow = WomensRankingRow & {
  position: string;
  games: number;
  value: number;
  sample?: number;
  team_id?: string;
  box_rows?: number;
};

export type WomensRankingBoard = {
  label: string;
  stat: string;
  unit: string;
  description?: string;
  sample_field?: string;
  min_sample?: number;
  sample_unit?: string;
  rows: WomensRankingBoardRow[];
};

export type WomensRankingCoverage = Record<string, { observed: number; qualified: number }>;

export type WomensRankingArchive = {
  season?: number;
  generated_at?: string;
  coverage?: Record<string, unknown>;
  min_games: number;
  qualification?: { field: string; minimum: number; scope: string; schedule_reconciled: boolean; dnp_excluded?: boolean };
  coverage_by_metric: WomensRankingCoverage;
  leaderboards: Record<string, WomensRankingBoard>;
  receipt?: { sha256?: string | null; url?: string };
};

export type WomensRankingPublication = {
  schema_version: 3;
  sport: "basketball";
  gender: "women";
  season: number;
  min_games: number;
  qualification?: { field: string; minimum: number; scope: string; schedule_reconciled: boolean };
  coverage: WomensRankingCoverage;
  leaderboards: Record<string, WomensRankingBoard>;
  limitations: string[];
  generated_at?: string;
  source_edition_generated_at?: string;
  receipts?: Record<string, { sha256?: string | null; url?: string }>;
  box_archive?: WomensRankingArchive;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;
const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function rankingInvalid(reason: string): never {
  throw new Error(`Women’s ranking release failed integrity validation: ${reason}`);
}

function parseCoverage(value: unknown, field: string): WomensRankingCoverage {
  if (!isRecord(value)) rankingInvalid(`${field} coverage is missing.`);
  const coverage: WomensRankingCoverage = {};
  for (const [metric, raw] of Object.entries(value)) {
    if (!isRecord(raw) || !nonNegativeInteger(raw.observed) || !nonNegativeInteger(raw.qualified) || raw.qualified > raw.observed) {
      rankingInvalid(`${field} coverage for ${metric} is invalid.`);
    }
    coverage[metric] = { observed: raw.observed, qualified: raw.qualified };
  }
  return coverage;
}

function parseBoard(value: unknown, metric: string, expectedQualified?: number): WomensRankingBoard {
  if (!isRecord(value) || !nonEmptyString(value.label) || !nonEmptyString(value.stat) || !nonEmptyString(value.unit) || !Array.isArray(value.rows)) {
    rankingInvalid(`leaderboard ${metric} is incomplete.`);
  }
  const seen = new Set<string>();
  const rows = value.rows.map((raw, index) => {
    if (!isRecord(raw) || !nonEmptyString(raw.player_id) || !nonEmptyString(raw.name) || !nonEmptyString(raw.team)
      || (raw.position !== undefined && typeof raw.position !== "string")
      || !nonNegativeInteger(raw.games) || !finiteNumber(raw.value)
      || !positiveInteger(raw.rank)
      || seen.has(raw.player_id)
      || (raw.sample !== undefined && (!finiteNumber(raw.sample) || (raw.sample as number) < 0))
      || (raw.box_rows !== undefined && !nonNegativeInteger(raw.box_rows))
      || (raw.team_id !== undefined && !nonEmptyString(raw.team_id))) {
      rankingInvalid(`leaderboard ${metric} row ${index + 1} is invalid.`);
    }
    seen.add(raw.player_id);
    return {
      rank: raw.rank,
      name: raw.name,
      team: raw.team,
      player_id: raw.player_id,
      position: typeof raw.position === "string" ? raw.position : "",
      games: raw.games,
      value: raw.value,
      ...(raw.sample === undefined ? {} : { sample: raw.sample }),
      ...(raw.team_id === undefined ? {} : { team_id: raw.team_id }),
      ...(raw.box_rows === undefined ? {} : { box_rows: raw.box_rows }),
    } satisfies WomensRankingBoardRow;
  });
  if (expectedQualified !== undefined && rows.length !== expectedQualified) {
    rankingInvalid(`leaderboard ${metric} row count does not match its qualified coverage.`);
  }
  for (const optional of ["description", "sample_field", "sample_unit"] as const) {
    if (value[optional] !== undefined && typeof value[optional] !== "string") rankingInvalid(`leaderboard ${metric} has an invalid ${optional}.`);
  }
  if (value.min_sample !== undefined && (!finiteNumber(value.min_sample) || value.min_sample < 0)) rankingInvalid(`leaderboard ${metric} has an invalid minimum sample.`);
  return {
    label: value.label,
    stat: value.stat,
    unit: value.unit,
    rows,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(typeof value.sample_field === "string" ? { sample_field: value.sample_field } : {}),
    ...(typeof value.min_sample === "number" ? { min_sample: value.min_sample } : {}),
    ...(typeof value.sample_unit === "string" ? { sample_unit: value.sample_unit } : {}),
  };
}

function parseLeaderboards(value: unknown, coverage: WomensRankingCoverage, field: string): Record<string, WomensRankingBoard> {
  if (!isRecord(value) || !Object.keys(value).length) rankingInvalid(`${field} leaderboards are missing.`);
  const boards: Record<string, WomensRankingBoard> = {};
  for (const [metric, raw] of Object.entries(value)) {
    const metricCoverage = coverage[metric];
    if (!metricCoverage) rankingInvalid(`${field} leaderboard ${metric} has no coverage entry.`);
    boards[metric] = parseBoard(raw, `${field}.${metric}`, metricCoverage.qualified);
  }
  return boards;
}

function parseArchive(value: unknown): WomensRankingArchive {
  if (!isRecord(value) || !nonNegativeInteger(value.min_games)) rankingInvalid("box archive metadata is invalid.");
  const coverage = parseCoverage(value.coverage_by_metric, "box archive");
  const leaderboards = parseLeaderboards(value.leaderboards, coverage, "box archive");
  return {
    min_games: value.min_games,
    coverage_by_metric: coverage,
    leaderboards,
    ...(nonNegativeInteger(value.season) ? { season: value.season } : {}),
    ...(typeof value.generated_at === "string" ? { generated_at: value.generated_at } : {}),
    ...(isRecord(value.coverage) ? { coverage: value.coverage } : {}),
    ...(isRecord(value.receipt) ? { receipt: value.receipt as WomensRankingArchive["receipt"] } : {}),
  };
}

/** Validate the complete women’s D1 ranking release before any board renders. */
export function parseWomensRankingPublication(value: unknown): WomensRankingPublication {
  if (!isRecord(value) || value.schema_version !== 3 || value.sport !== "basketball" || value.gender !== "women") {
    rankingInvalid("scope or schema version is not exact.");
  }
  if (!nonNegativeInteger(value.season) || !nonNegativeInteger(value.min_games)) rankingInvalid("season or minimum games is invalid.");
  const coverage = parseCoverage(value.coverage, "season");
  const leaderboards = parseLeaderboards(value.leaderboards, coverage, "season");
  if (!Array.isArray(value.limitations) || value.limitations.length === 0 || value.limitations.some((item) => !nonEmptyString(item))) rankingInvalid("limitations are missing.");
  return {
    schema_version: 3,
    sport: "basketball",
    gender: "women",
    season: value.season,
    min_games: value.min_games,
    coverage,
    leaderboards,
    limitations: value.limitations,
    ...(isRecord(value.qualification) ? { qualification: value.qualification as WomensRankingPublication["qualification"] } : {}),
    ...(typeof value.generated_at === "string" ? { generated_at: value.generated_at } : {}),
    ...(typeof value.source_edition_generated_at === "string" ? { source_edition_generated_at: value.source_edition_generated_at } : {}),
    ...(isRecord(value.receipts) ? { receipts: value.receipts as WomensRankingPublication["receipts"] } : {}),
    ...(value.box_archive === undefined ? {} : { box_archive: parseArchive(value.box_archive) }),
  };
}

export type WomensRankingSample = {
  sample?: number;
};

export type WomensRankingSampleRule = {
  min_sample?: number;
  sample_unit?: string;
};

/** Keep the women’s source-player handoff in its own identity namespace. */
export function womensPlayerTableHref(playerId: string | number): string {
  return `/basketball/players/?gender=women&division=1&q=${encodeURIComponent(String(playerId))}`;
}

/**
 * Open the exact women’s player file at its shot-map section. The player file
 * performs the separate-name/team identity review before selecting a shot
 * profile; this helper never treats the two source ID namespaces as joined.
 */
export function womensPlayerShotMapHref(playerId: string | number): string {
  return `/basketball/womens-player/?id=${encodeURIComponent(String(playerId))}#wbb-shot-map-title`;
}

/** Keep absent coverage distinct from a source-reported zero. */
export function womensRankingCountLabel(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString("en-US")
    : "Unavailable";
}

/** Format only a finite denominator that clears the board's published floor. */
export function womensRankingSampleLabel(
  row: WomensRankingSample,
  board: WomensRankingSampleRule,
): string | null {
  if (
    typeof row.sample !== "number"
    || !Number.isFinite(row.sample)
    || typeof board.min_sample !== "number"
    || !Number.isFinite(board.min_sample)
    || board.min_sample < 0
    || row.sample < board.min_sample
    || typeof board.sample_unit !== "string"
    || !board.sample_unit.trim()
  ) return null;
  return `${row.sample.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${board.sample_unit.trim()}`;
}

/** Filter the retained board without changing its source-assigned ranks. */
export function filterWomensRankingRows<T extends WomensRankingRow>(
  rows: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    `${row.name} ${row.team} ${row.player_id}`.toLowerCase().includes(needle),
  );
}

/** Return one bounded page while preserving each row's global board rank. */
export function paginateWomensRankingRows<T>(
  rows: T[],
  page: number,
  pageSize = 50,
): T[] {
  if (!Number.isInteger(pageSize) || pageSize < 1) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;
  return rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
}
