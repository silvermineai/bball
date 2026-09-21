export type LowerDivisionRow = Record<string, unknown> & {
  name?: unknown;
  team?: unknown;
  rank?: unknown;
  g?: unknown;
  gm?: unknown;
  source_fields?: Record<string, unknown>;
};

export const LOWER_DIVISION_PAGE_SIZE = 25;

const text = (value: unknown) => value == null ? "" : String(value);

/**
 * Return the value for a published column without guessing at its meaning.
 *
 * NCAA table headers are not stable object keys (for example, `FG%` is
 * published as `fg` by the capture normalizer).  The retained source_fields
 * map is therefore authoritative for rendering.  The normalized-key fallback
 * keeps this helper useful for older releases that predate source_fields.
 */
export const lowerDivisionCellValue = (row: LowerDivisionRow, header: string): unknown => {
  const sourceFields = row.source_fields;
  if (sourceFields && Object.prototype.hasOwnProperty.call(sourceFields, header)) return sourceFields[header];
  const key = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return row[header];
};

const number = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** Read the source's games column without filling missing values. */
export const lowerDivisionGames = (row: LowerDivisionRow): number | null => {
  const direct = number(row.g ?? row.gm);
  if (direct != null) return direct;
  const fields = row.source_fields || {};
  return number(fields.G ?? fields.GM);
};

const searchText = (row: LowerDivisionRow) => [
  row.name,
  row.team,
  row.rank,
  row.source_fields && Object.values(row.source_fields),
].flat().map(text).join(" ").toLowerCase();

/** Filter source-native rows in publisher order; no identity join is made. */
export const filterWomensLowerDivisionRows = <T extends LowerDivisionRow>(
  rows: readonly T[],
  query: string,
  minimumGames = 0,
): T[] => {
  const needle = query.trim().toLowerCase();
  const minimum = Number.isFinite(minimumGames) && minimumGames > 0 ? minimumGames : 0;
  return rows.filter((row) => {
    if (needle && !searchText(row).includes(needle)) return false;
    const games = lowerDivisionGames(row);
    return minimum === 0 || (games != null && games >= minimum);
  });
};

export const paginateWomensLowerDivisionRows = <T>(
  rows: readonly T[],
  page: number,
  pageSize = LOWER_DIVISION_PAGE_SIZE,
): T[] => {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : LOWER_DIVISION_PAGE_SIZE;
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;
  return rows.slice(safePage * safePageSize, (safePage + 1) * safePageSize);
};
