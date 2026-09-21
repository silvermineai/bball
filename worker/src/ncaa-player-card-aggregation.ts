/**
 * Aggregate the numeric fields in an exact NCAA player game archive.
 *
 * The season summary intentionally keeps only fields observed on every
 * player-team row. That protects rates from partial source data, but it can
 * hide valid game-level fields on a player card. This view keeps the source
 * coverage visible while summing only additive box fields. Published rate
 * fields are reported as observed counts and are never incorrectly added.
 */

export type GameStatAggregateRow = {
  contest_id?: unknown;
  stats_json?: unknown;
};

export type GameStatFieldAggregate = {
  observed: number;
  total: number | null;
};

export type GameStatAggregate = {
  rows: number;
  contests: number;
  fields: Record<string, GameStatFieldAggregate>;
};

const nonAdditiveField = (key: string) =>
  key.endsWith("_pct") || key.startsWith("pct_") || key === "ts_pct" || key === "efg_pct";

function parseStats(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** Aggregate exact source rows without filling missing values or summing rates. */
export function aggregateNcaaPlayerGameStats(rows: readonly GameStatAggregateRow[]): GameStatAggregate {
  const contests = new Set<string>();
  const fields: Record<string, GameStatFieldAggregate> = {};
  let validRows = 0;
  for (const row of rows) {
    const stats = parseStats(row.stats_json);
    if (!stats) continue;
    validRows += 1;
    if (row.contest_id != null && String(row.contest_id).trim()) contests.add(String(row.contest_id));
    for (const [key, raw] of Object.entries(stats)) {
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const field = fields[key] || { observed: 0, total: nonAdditiveField(key) ? null : 0 };
      field.observed += 1;
      if (field.total != null) field.total += raw;
      fields[key] = field;
    }
  }
  return { rows: validRows, contests: contests.size, fields };
}
