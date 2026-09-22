import type { WomensLowerDivisionStatistic } from "./womens-lower-division-integrity";

type ApiStatistic = {
  statistic?: unknown;
  label?: unknown;
  headers?: unknown;
  rows?: unknown;
  source_url?: unknown;
};

export type WomensLowerStatsMeta = {
  division: string;
  kind: "individual" | "team";
  statistics: Array<{
    statistic: string;
    label: string;
    rows: number;
    source_url: string;
  }>;
  source_receipts?: unknown[];
};

export type WomensLowerStatsResponse = {
  division: string;
  kind: "individual" | "team";
  statistic: string;
  label: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  source_url: string;
  source_receipts?: unknown[];
  through_games?: string | null;
};

const isHttps = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.startsWith("https://")) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Keep the browser-side API boundary source-native. The Worker validates the
 * edition before responding, but rejecting a malformed or cross-division
 * response here prevents a stale proxy/cache response from being rendered as
 * the requested leaderboard.
 */
export function parseWomensLowerStatsMeta(value: unknown, division: "2" | "3"): WomensLowerStatsMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Women’s lower-division catalog is malformed.");
  const candidate = value as Record<string, unknown>;
  if (candidate.division !== division || candidate.kind !== "individual" || !Array.isArray(candidate.statistics)) {
    throw new Error(`Women’s D${division} individual catalog scope is invalid.`);
  }
  const statistics = candidate.statistics.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Women’s lower-division statistic catalog is malformed.");
    const stat = entry as Record<string, unknown>;
    const rowCount = typeof stat.rows === "number" ? stat.rows : Number.NaN;
    if (typeof stat.statistic !== "string" || !stat.statistic || typeof stat.label !== "string" || !Number.isInteger(rowCount) || rowCount < 0 || !isHttps(stat.source_url)) {
      throw new Error("Women’s lower-division statistic catalog is invalid.");
    }
    return { statistic: stat.statistic, label: stat.label, rows: rowCount, source_url: stat.source_url };
  });
  return {
    division,
    kind: "individual",
    statistics,
    source_receipts: Array.isArray(candidate.source_receipts) ? candidate.source_receipts : [],
  };
}

export function parseWomensLowerStatsResponse(
  value: unknown,
  division: "2" | "3",
  statistic: string,
): WomensLowerDivisionStatistic & { source_receipts: unknown[]; through_games?: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Women’s lower-division statistic response is malformed.");
  const candidate = value as ApiStatistic & Record<string, unknown>;
  if (candidate.division !== division || candidate.kind !== "individual" || candidate.statistic !== statistic
    || typeof candidate.label !== "string" || !Array.isArray(candidate.headers) || candidate.headers.length === 0
    || candidate.headers.some((header) => typeof header !== "string") || !Array.isArray(candidate.rows)
    || candidate.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)) || !isHttps(candidate.source_url)) {
    throw new Error(`Women’s D${division} ${statistic} response scope is invalid.`);
  }
  return {
    statistic: candidate.statistic,
    label: candidate.label,
    headers: candidate.headers as string[],
    rows: candidate.rows as Array<Record<string, unknown>>,
    source_url: candidate.source_url,
    source_receipts: Array.isArray(candidate.source_receipts) ? candidate.source_receipts : [],
    through_games: typeof candidate.through_games === "string" ? candidate.through_games : null,
  } as WomensLowerDivisionStatistic & { source_receipts: unknown[]; through_games?: string | null };
}
