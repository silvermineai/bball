export type WomensRankingRow = {
  rank: number;
  name: string;
  team: string;
  player_id: string;
};

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
