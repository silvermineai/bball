export const recruitingIntakeColumns = [
  "record_id", "season", "player_name", "player_source_id", "from_program", "from_program_id",
  "to_program", "to_program_id", "status", "status_date", "source_published_on", "source_url",
  "source_publisher", "captured_at",
] as const;

const requiredColumns = ["season", "player_name", "from_program", "to_program", "status", "status_date", "source_published_on", "source_url", "source_publisher", "captured_at"] as const;
const statuses = new Set(["reported_transfer", "reported_commitment", "reported_withdrawal", "reported_eligibility", "reported_unavailability", "reported_update"]);

export type RecruitingIntakePreflight = {
  headers: string[];
  rows: number;
  seasons: number[];
  statusCounts: Record<string, number>;
  errors: string[];
  warnings: string[];
};

/** Parse RFC 4180-style CSV without sending the selected file anywhere. */
export function parseRecruitingCsv(text: string): string[][] {
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

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && (() => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
})();
const isIsoTimestamp = (value: string) => /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) && !Number.isNaN(new Date(value).valueOf());

/** Match the server importer’s row-level checks as an operator-side preflight. */
export function validateRecruitingIntakeCsv(text: string, now = new Date()): RecruitingIntakePreflight {
  const parsed = parseRecruitingCsv(text);
  const headers = (parsed[0] || []).map((header) => header.trim());
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!headers.length) return { headers, rows: 0, seasons: [], statusCounts: {}, errors: ["CSV is missing a header row."], warnings };
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length) errors.push(`Missing required columns: ${missing.join(", ")}`);
  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length) errors.push(`Duplicate header: ${[...new Set(duplicateHeaders)].join(", ")}`);
  if (errors.length) return { headers, rows: Math.max(0, parsed.length - 1), seasons: [], statusCounts: {}, errors, warnings };
  const index = new Map(headers.map((header, position) => [header, position]));
  const seasons = new Set<number>();
  const statusCounts: Record<string, number> = {};
  const recordIds = new Set<string>();
  const addError = (message: string) => { if (errors.length < 8) errors.push(message); };
  parsed.slice(1).forEach((cells, rowIndex) => {
    const row = rowIndex + 2;
    const value = (column: string) => (cells[index.get(column) ?? -1] || "").trim();
    const season = value("season"); const status = value("status").toLowerCase(); const captured = value("captured_at");
    const statusDate = value("status_date"); const published = value("source_published_on");
    if (!season || !/^\d+$/.test(season) || Number(season) < 2025 || Number(season) > 2035) addError(`Row ${row}: season must be between 2025 and 2035.`);
    else seasons.add(Number(season));
    if (!value("player_name")) addError(`Row ${row}: player_name is required.`);
    if (!value("to_program")) addError(`Row ${row}: to_program is required.`);
    if (!statuses.has(status)) addError(`Row ${row}: unsupported status “${status || "(blank)"}”.`);
    else statusCounts[status] = (statusCounts[status] || 0) + 1;
    if ((status === "reported_transfer" || status === "reported_commitment") && !value("from_program")) addError(`Row ${row}: from_program is required for ${status}.`);
    if (!isDate(statusDate)) addError(`Row ${row}: status_date must be YYYY-MM-DD.`);
    if (!isDate(published)) addError(`Row ${row}: source_published_on must be YYYY-MM-DD.`);
    if (!isIsoTimestamp(captured)) addError(`Row ${row}: captured_at must include a timezone.`);
    const capturedDate = isIsoTimestamp(captured) ? new Date(captured) : null;
    if (capturedDate && capturedDate > now) addError(`Row ${row}: captured_at cannot be in the future.`);
    if (capturedDate && isDate(statusDate) && new Date(`${statusDate}T00:00:00Z`) > capturedDate) addError(`Row ${row}: status_date is after captured_at.`);
    if (capturedDate && isDate(published) && new Date(`${published}T00:00:00Z`) > capturedDate) addError(`Row ${row}: source_published_on is after captured_at.`);
    try { const url = new URL(value("source_url")); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
    catch { addError(`Row ${row}: source_url must be an HTTPS URL without credentials.`); }
    const recordId = value("record_id");
    if (recordId) { if (recordIds.has(recordId)) addError(`Row ${row}: duplicate record_id “${recordId}”.`); recordIds.add(recordId); }
    else warnings.push(`Row ${row}: record_id is blank; the importer will derive one.`);
  });
  if (!parsed.slice(1).length) errors.push("CSV contains no data rows.");
  if (errors.length > 8) errors.splice(8, errors.length, `…and ${errors.length - 8} more row errors.`);
  return { headers, rows: Math.max(0, parsed.length - 1), seasons: [...seasons].sort(), statusCounts, errors, warnings };
}
