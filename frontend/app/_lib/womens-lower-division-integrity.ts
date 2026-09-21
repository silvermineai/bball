export type WomensLowerDivision = "2" | "3";

export type WomensLowerDivisionReceipt = {
  url: string;
  status: number;
  sha256: string;
  bytes: number;
};

export type WomensLowerDivisionStatistic = {
  label: string;
  statistic: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  source_url: string;
  through_games?: string | null;
};

export type WomensLowerDivisionEdition = {
  schema_version: number;
  generated_at: string;
  source: { publisher: string; robots_url: string; method: string; limitation: string };
  divisions: Record<WomensLowerDivision, {
    source_scope: { sport: "basketball"; gender: "women"; division: number };
    source_url: string;
    season: number;
    through_games?: string | null;
    identity_status: string;
    identity_note: string;
    available_statistics: Record<"individual" | "team", Array<{ label: string; source_path: string }>>;
    individual: WomensLowerDivisionStatistic[];
    team: WomensLowerDivisionStatistic[];
  }>;
  receipts: WomensLowerDivisionReceipt[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.startsWith("https://")) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const fail = (reason: string): never => {
  throw new Error(`Women’s lower-division release failed integrity validation: ${reason}`);
};

function validateStatistic(
  value: unknown,
  division: WomensLowerDivision,
  kind: "individual" | "team",
  receiptUrls: Set<string>,
  availablePaths: Set<string>,
): WomensLowerDivisionStatistic {
  if (!isRecord(value)) return fail(`D${division} ${kind} statistic is not an object.`);
  if (typeof value.label !== "string" || typeof value.statistic !== "string") return fail(`D${division} ${kind} statistic has no label or key.`);
  if (!Array.isArray(value.headers) || value.headers.length === 0 || value.headers.some((header) => typeof header !== "string")) return fail(`D${division} ${kind} ${value.statistic} has invalid headers.`);
  if (!Array.isArray(value.rows) || value.rows.some((row) => !isRecord(row))) return fail(`D${division} ${kind} ${value.statistic} has malformed rows.`);
  if (!isHttpsUrl(value.source_url)) return fail(`D${division} ${kind} ${value.statistic} has no HTTPS source URL.`);
  const sourcePath = new URL(value.source_url).pathname;
  if (!availablePaths.has(sourcePath)) return fail(`D${division} ${kind} ${value.statistic} source path is absent from the available-statistics ledger.`);
  if (!receiptUrls.has(value.source_url)) return fail(`D${division} ${kind} ${value.statistic} has no matching source receipt.`);
  for (const row of value.rows) {
    if (!isRecord(row.source_fields)) return fail(`D${division} ${kind} ${value.statistic} has a row without retained source fields.`);
  }
  return value as unknown as WomensLowerDivisionStatistic;
}

/**
 * Parse the source-native women’s D2/D3 release without allowing a malformed
 * or cross-division payload to reach the leaderboard. The release intentionally
 * retains names and source fields only; this validator never creates IDs.
 */
export function parseWomensLowerDivisionEdition(value: unknown): WomensLowerDivisionEdition {
  if (!isRecord(value)) return fail("release is not an object.");
  if (value.schema_version !== 1) return fail("unsupported schema version.");
  if (typeof value.generated_at !== "string" || Number.isNaN(Date.parse(value.generated_at))) return fail("generated_at is invalid.");
  if (!isRecord(value.source) || typeof value.source.publisher !== "string") return fail("source metadata is missing.");
  if (!Array.isArray(value.receipts) || value.receipts.length === 0) return fail("source receipts are missing.");

  const receipts: WomensLowerDivisionReceipt[] = value.receipts.map((receipt) => {
    if (!isRecord(receipt) || !isHttpsUrl(receipt.url) || receipt.status !== 200 || typeof receipt.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(receipt.sha256) || typeof receipt.bytes !== "number" || !Number.isInteger(receipt.bytes) || receipt.bytes <= 0) return fail("a source receipt is malformed.");
    return receipt as unknown as WomensLowerDivisionReceipt;
  });
  const receiptUrls = new Set(receipts.map((receipt) => receipt.url));
  if (receiptUrls.size !== receipts.length) return fail("source receipts contain duplicate URLs.");

  if (!isRecord(value.divisions)) return fail("division map is missing.");
  const divisions = {} as WomensLowerDivisionEdition["divisions"];
  for (const division of ["2", "3"] as const) {
    // The checked-in publication uses d2/d3 keys; the route contract uses
    // numeric division values. Normalize that boundary once for the client.
    const current = value.divisions[`d${division}`];
    if (!isRecord(current)) return fail(`D${division} division is missing.`);
    const scope = current.source_scope;
    if (!isRecord(scope) || scope.sport !== "basketball" || scope.gender !== "women" || scope.division !== Number(division)) return fail(`D${division} source scope is not exact.`);
    if (!isHttpsUrl(current.source_url) || !receiptUrls.has(current.source_url)) return fail(`D${division} source URL has no receipt.`);
    if (!Number.isInteger(current.season) || typeof current.identity_status !== "string" || typeof current.identity_note !== "string") return fail(`D${division} metadata is incomplete.`);
    if (!isRecord(current.available_statistics) || !Array.isArray(current.available_statistics.individual) || !Array.isArray(current.available_statistics.team)) return fail(`D${division} available-statistics ledger is missing.`);
    const availableStatistics = current.available_statistics as { individual: unknown[]; team: unknown[] };
    const availablePaths = new Set<string>();
    for (const kind of ["individual", "team"] as const) {
      for (const candidate of availableStatistics[kind]) {
        if (!isRecord(candidate) || typeof candidate.label !== "string" || typeof candidate.source_path !== "string" || !candidate.source_path.startsWith(`/stats/basketball-women/d${division}/`)) return fail(`D${division} ${kind} available-statistics ledger is malformed.`);
        availablePaths.add(candidate.source_path);
      }
    }
    if (!Array.isArray(current.individual) || !Array.isArray(current.team)) return fail(`D${division} statistic tables are missing.`);
    divisions[division] = {
      ...current,
      source_scope: scope as WomensLowerDivisionEdition["divisions"]["2"]["source_scope"],
      available_statistics: current.available_statistics as WomensLowerDivisionEdition["divisions"]["2"]["available_statistics"],
      individual: current.individual.map((stat) => validateStatistic(stat, division, "individual", receiptUrls, availablePaths)),
      team: current.team.map((stat) => validateStatistic(stat, division, "team", receiptUrls, availablePaths)),
    } as WomensLowerDivisionEdition["divisions"][typeof division];
  }
  return { ...value, source: value.source as WomensLowerDivisionEdition["source"], receipts, divisions } as unknown as WomensLowerDivisionEdition;
}
