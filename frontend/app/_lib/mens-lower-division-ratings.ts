export type MensLowerDivision = "2" | "3";

export type MensLowerRating = {
  rank: number;
  team_id: string;
  team: string;
  conference?: string | null;
  games: number;
  wins: number;
  losses: number;
  win_pct: number;
  avg_margin: number;
  rating: number;
};

export type MensLowerDivisionRatings = {
  division: number;
  season: number;
  target_season: number;
  model_id: string;
  model_status: string;
  forecast_status: string;
  method: string;
  coverage: {
    source_contests: number;
    valid_final_games: number;
    teams: number;
    source_receipts: number;
    excluded?: Record<string, number>;
  };
  fit: { ridge: number; home_advantage: number; training_games: number; training_season: number };
  backtest: {
    status: string;
    evaluated_games?: number;
    margin_mae?: number;
    winner_accuracy?: number;
    holdout_start?: string;
    holdout_end?: string;
    reason?: string;
  };
  ratings: MensLowerRating[];
  target_schedule: { status: string; games: number; note: string };
  source: { schedule_asset_sha256?: string | null; receipt_count: number; receipt_digest: string };
  readiness: { key: string; status: string; detail: string }[];
  limitations: string[];
};

export type MensLowerRatingsAsset = {
  schema_version: 1;
  generated_at: string;
  sport: "basketball";
  gender: "men";
  target_season: 2027;
  model_status: "research_only";
  forecast_status: "not_published";
  source_schedule_asset: string;
  divisions: Record<`d${MensLowerDivision}`, MensLowerDivisionRatings>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isSha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const requireNumber = (value: unknown, field: string) => {
  if (!isFiniteNumber(value)) throw new Error(`Invalid men's lower ratings field: ${field}`);
  return value;
};

const requireString = (value: unknown, field: string) => {
  if (!isString(value)) throw new Error(`Invalid men's lower ratings field: ${field}`);
  return value;
};

const parseDivision = (value: unknown, key: MensLowerDivision): MensLowerDivisionRatings => {
  if (!isObject(value) || value.division !== Number(key) || value.schema_version !== 1 || value.sport !== "basketball" || value.gender !== "men") {
    throw new Error(`Invalid men's lower ratings division: d${key}`);
  }
  if (value.model_status !== "research_only" || value.forecast_status !== "not_published") {
    throw new Error(`Men's D${key} ratings cannot publish an unverified forecast.`);
  }
  if (!isObject(value.coverage) || !isObject(value.fit) || !isObject(value.backtest) || !isObject(value.target_schedule) || !isObject(value.source) || !Array.isArray(value.ratings) || !Array.isArray(value.readiness) || !Array.isArray(value.limitations)) {
    throw new Error(`Invalid men's lower ratings evidence for d${key}`);
  }
  if (value.target_schedule.status !== "missing" || value.target_schedule.games !== 0 || !isString(value.target_schedule.note)) {
    throw new Error(`Men's D${key} target schedule gate is not explicit.`);
  }
  if (!isString(value.model_id) || !value.model_id.startsWith(`mbb-lower-ratings-v1-d${key}-`)) {
    throw new Error(`Men's D${key} model namespace is invalid.`);
  }
  if (!isFiniteNumber(value.coverage.valid_final_games) || !isFiniteNumber(value.coverage.teams) || !isFiniteNumber(value.coverage.source_receipts) || value.coverage.valid_final_games <= 0 || value.coverage.teams <= 0 || value.coverage.source_receipts <= 0) {
    throw new Error(`Men's D${key} coverage is incomplete.`);
  }
  if (!isSha256(value.source.receipt_digest) || (value.source.schedule_asset_sha256 !== null && !isSha256(value.source.schedule_asset_sha256))) {
    throw new Error(`Men's D${key} source receipt is invalid.`);
  }
  const ratings = value.ratings.map((raw, index) => {
    if (!isObject(raw) || !isString(raw.team_id) || !isString(raw.team) || !isFiniteNumber(raw.rank) || raw.rank !== index + 1 || !isFiniteNumber(raw.games) || !isFiniteNumber(raw.wins) || !isFiniteNumber(raw.losses) || !isFiniteNumber(raw.win_pct) || !isFiniteNumber(raw.avg_margin) || !isFiniteNumber(raw.rating)) {
      throw new Error(`Invalid men's lower ratings row ${index + 1} in d${key}`);
    }
    return raw as unknown as MensLowerRating;
  });
  if (ratings.length !== value.coverage.teams) throw new Error(`Men's D${key} rating/team coverage differs.`);
  return value as unknown as MensLowerDivisionRatings;
};

export const parseMensLowerRatingsAsset = (value: unknown): MensLowerRatingsAsset => {
  if (!isObject(value) || value.schema_version !== 1 || value.sport !== "basketball" || value.gender !== "men" || value.target_season !== 2027 || value.model_status !== "research_only" || value.forecast_status !== "not_published" || !isString(value.generated_at) || !isString(value.source_schedule_asset) || !isObject(value.divisions)) {
    throw new Error("Invalid men's lower ratings asset.");
  }
  const divisions = {} as Record<`d${MensLowerDivision}`, MensLowerDivisionRatings>;
  for (const key of ["2", "3"] as const) divisions[`d${key}`] = parseDivision(value.divisions[`d${key}`], key);
  return { ...value, divisions } as unknown as MensLowerRatingsAsset;
};

export type MensLowerRatingsSort = "rank" | "rating" | "win_pct" | "avg_margin" | "team";

export const filterMensLowerRatings = (rows: MensLowerRating[], query: string) => {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return rows.slice();
  return rows.filter((row) => [row.team, row.team_id, row.conference || ""].some((field) => field.toLocaleLowerCase().includes(needle)));
};

export const sortMensLowerRatings = (rows: MensLowerRating[], sort: MensLowerRatingsSort, direction: "asc" | "desc" = "desc") => {
  const multiplier = direction === "asc" ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = sort === "team" ? a.row.team.toLocaleLowerCase() : a.row[sort];
    const right = sort === "team" ? b.row.team.toLocaleLowerCase() : b.row[sort];
    const compared = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right);
    return compared === 0 ? a.index - b.index : compared * multiplier;
  }).map(({ row }) => row);
};

