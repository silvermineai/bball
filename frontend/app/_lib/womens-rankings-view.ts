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
