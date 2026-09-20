export type WomensRankingRow = {
  rank: number;
  name: string;
  team: string;
  player_id: string;
};

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
