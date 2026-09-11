export const marketImportColumns = [
  "game_id", "market", "starts_at", "captured_at", "updated_at", "home_name", "away_name", "bookmaker",
  "line", "home_price", "away_price", "over_price", "under_price", "home_american", "away_american", "over_american", "under_american", "event_id",
] as const;

const requiredColumns = ["game_id", "market", "starts_at", "captured_at", "updated_at", "home_name", "away_name", "bookmaker"] as const;
const markets = new Set(["spreads", "totals", "h2h"]);

export type MarketImportPreflight = {
  headers: string[];
  rows: number;
  markets: Record<string, number>;
  errors: string[];
  warnings: string[];
};

export type MarketImportRow = {
  gameId: string;
  market: "spreads" | "totals" | "h2h" | string;
  startsAt: string;
  capturedAt: string;
  updatedAt: string;
  homeName: string;
  awayName: string;
  bookmaker: string;
  line: number | null;
  homePrice: number | null;
  awayPrice: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

/** Parse RFC 4180-style CSV locally; the selected file never leaves the browser. */
export function parseMarketCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === "") quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row); }
  return rows;
}

const isoTimestamp = (value: string) => /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) && !Number.isNaN(new Date(value).valueOf());
const number = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const price = (decimal: string, american: string) => {
  const parsedDecimal = number(decimal);
  if (parsedDecimal != null) return parsedDecimal > 1;
  const parsedAmerican = number(american);
  return parsedAmerican != null && parsedAmerican !== 0;
};

const decimalPrice = (decimal: string, american: string) => {
  const parsedDecimal = number(decimal);
  if (parsedDecimal != null && parsedDecimal > 1) return parsedDecimal;
  const parsedAmerican = number(american);
  if (parsedAmerican == null || parsedAmerican === 0) return null;
  return parsedAmerican > 0 ? 1 + parsedAmerican / 100 : 1 + 100 / Math.abs(parsedAmerican);
};

/** Parse validated provider rows into a browser-only comparison preview. */
export function parseMarketImportRows(text: string): MarketImportRow[] {
  const parsed = parseMarketCsv(text);
  const headers = (parsed[0] || []).map((header) => header.trim());
  if (!headers.length) return [];
  const index = new Map(headers.map((header, position) => [header, position]));
  return parsed.slice(1).map((cells) => {
    const value = (column: string) => (cells[index.get(column) ?? -1] || "").trim();
    return {
      gameId: value("game_id"),
      market: value("market").toLowerCase(),
      startsAt: value("starts_at"),
      capturedAt: value("captured_at"),
      updatedAt: value("updated_at"),
      homeName: value("home_name"),
      awayName: value("away_name"),
      bookmaker: value("bookmaker"),
      line: number(value("line")) ?? number(value("home_spread")),
      homePrice: decimalPrice(value("home_price"), value("home_american")),
      awayPrice: decimalPrice(value("away_price"), value("away_american")),
      overPrice: decimalPrice(value("over_price"), value("over_american")),
      underPrice: decimalPrice(value("under_price"), value("under_american")),
    };
  });
}

/** Match the server importer’s row checks before an operator sends an export for import. */
export function validateMarketImportCsv(text: string, now = new Date()): MarketImportPreflight {
  const parsed = parseMarketCsv(text);
  const headers = (parsed[0] || []).map((header) => header.trim());
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!headers.length) return { headers, rows: 0, markets: {}, errors: ["CSV is missing a header row."], warnings };
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length) errors.push(`Missing required columns: ${missing.join(", ")}`);
  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length) errors.push(`Duplicate header: ${[...new Set(duplicateHeaders)].join(", ")}`);
  if (errors.length) return { headers, rows: Math.max(0, parsed.length - 1), markets: {}, errors, warnings };
  const index = new Map(headers.map((header, position) => [header, position]));
  const counts: Record<string, number> = {};
  const addError = (message: string) => { if (errors.length < 8) errors.push(message); };
  parsed.slice(1).forEach((cells, rowIndex) => {
    const row = rowIndex + 2;
    const value = (column: string) => (cells[index.get(column) ?? -1] || "").trim();
    const market = value("market").toLowerCase();
    const starts = value("starts_at");
    const captured = value("captured_at");
    const updated = value("updated_at");
    if (!value("game_id")) addError(`Row ${row}: game_id is required and must match a source schedule row.`);
    if (!markets.has(market)) addError(`Row ${row}: market must be spreads, totals or h2h.`);
    else counts[market] = (counts[market] || 0) + 1;
    if (!value("home_name") || !value("away_name")) addError(`Row ${row}: exact home_name and away_name are required.`);
    if (!value("bookmaker")) addError(`Row ${row}: bookmaker is required.`);
    if (!isoTimestamp(starts)) addError(`Row ${row}: starts_at must include a timezone.`);
    if (!isoTimestamp(captured)) addError(`Row ${row}: captured_at must include a timezone.`);
    if (!isoTimestamp(updated)) addError(`Row ${row}: updated_at must include a timezone.`);
    const startsDate = isoTimestamp(starts) ? new Date(starts) : null;
    const capturedDate = isoTimestamp(captured) ? new Date(captured) : null;
    const updatedDate = isoTimestamp(updated) ? new Date(updated) : null;
    if (capturedDate && capturedDate >= now) addError(`Row ${row}: captured_at must be before the current time.`);
    if (startsDate && capturedDate && capturedDate >= startsDate) addError(`Row ${row}: captured_at must be before starts_at.`);
    if (capturedDate && updatedDate && updatedDate > capturedDate) addError(`Row ${row}: updated_at cannot be after captured_at.`);
    if (market === "spreads" && number(value("line")) == null) addError(`Row ${row}: spreads require line or home_spread.`);
    if (market === "totals" && number(value("line")) == null) addError(`Row ${row}: totals require line.`);
    if (market === "spreads" && (!price(value("home_price"), value("home_american")) || !price(value("away_price"), value("away_american")))) addError(`Row ${row}: spreads require valid home and away prices.`);
    if (market === "totals" && (!price(value("over_price"), value("over_american")) || !price(value("under_price"), value("under_american")))) addError(`Row ${row}: totals require valid over and under prices.`);
    if (market === "h2h" && (!price(value("home_price"), value("home_american")) || !price(value("away_price"), value("away_american")))) addError(`Row ${row}: h2h requires valid home and away prices.`);
    if (!value("event_id")) warnings.push(`Row ${row}: event_id is blank; the importer will derive one.`);
  });
  if (!parsed.slice(1).length) errors.push("CSV contains no data rows.");
  if (errors.length > 8) errors.splice(8, errors.length, `…and ${errors.length - 8} more row errors.`);
  return { headers, rows: Math.max(0, parsed.length - 1), markets: counts, errors, warnings };
}
