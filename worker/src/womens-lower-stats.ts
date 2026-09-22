import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
type RecordValue = Record<string, unknown>;

const querySchema = z.object({
  division: z.enum(["2", "3"]).default("2"),
  kind: z.enum(["individual", "team"]).default("individual"),
  statistic: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}$/).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(250).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(40),
  meta: z.enum(["0", "1"]).default("0"),
});

const ASSET_PATH = "/data/basketball/womens-lower-division-stats.json";
const CACHE_TTL = 300;
const ASSET_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("women's lower-division stats asset timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttps(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("https://")) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function isNCAAWomenStatsUrl(value: unknown): value is string {
  if (!isHttps(value)) return false;
  try {
    const url = new URL(value);
    return url.hostname === "www.ncaa.com" && /^\/stats\/basketball-women\/d[23](?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

function validReceipt(value: unknown): value is RecordValue {
  return isRecord(value)
    && isHttps(value.url)
    && value.status === 200
    && typeof value.sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(value.sha256)
    && typeof value.bytes === "number"
    && Number.isInteger(value.bytes)
    && value.bytes > 0;
}

function validStatistic(value: unknown, sourceUrls: Set<string>, availablePaths: Set<string>, kind: "individual" | "team"): value is RecordValue & {
  statistic: string;
  label: string;
  headers: string[];
  rows: RecordValue[];
  source_url: string;
} {
  if (!isRecord(value)
    || typeof value.statistic !== "string"
    || typeof value.label !== "string"
    || !Array.isArray(value.headers)
    || value.headers.length === 0
    || value.headers.some((header) => typeof header !== "string")
    || !Array.isArray(value.rows)
    || value.rows.some((row) => !isRecord(row))
    || !isNCAAWomenStatsUrl(value.source_url)
    || !sourceUrls.has(value.source_url)) return false;
  const sourcePath = new URL(value.source_url).pathname;
  if (!availablePaths.has(sourcePath) || !sourcePath.includes(`/${kind}/`)) return false;
  return value.rows.every((row) => isRecord(row.source_fields));
}

function validateEdition(value: unknown): RecordValue | null {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.generated_at !== "string" || Number.isNaN(Date.parse(value.generated_at))) return null;
  if (!isRecord(value.source) || value.source.publisher !== "NCAA.com" || !Array.isArray(value.receipts) || value.receipts.length === 0) return null;
  if (value.receipts.some((receipt) => !validReceipt(receipt))) return null;
  const receipts = value.receipts as RecordValue[];
  const sourceUrls = new Set<string>(receipts.map((receipt) => String(receipt.url)));
  if (sourceUrls.size !== receipts.length || !isRecord(value.divisions)) return null;
  for (const division of ["2", "3"] as const) {
    const current = value.divisions[`d${division}`];
    const available = isRecord(current) && isRecord(current.available_statistics) ? current.available_statistics : null;
    const availablePaths: Record<"individual" | "team", Set<string>> = { individual: new Set<string>(), team: new Set<string>() };
    if (available) {
      for (const kind of ["individual", "team"] as const) {
        const entries = available[kind];
        if (!Array.isArray(entries)) return null;
        for (const entry of entries) {
          if (!isRecord(entry) || typeof entry.label !== "string" || typeof entry.source_path !== "string" || !entry.source_path.startsWith(`/stats/basketball-women/d${division}/`)) return null;
          availablePaths[kind].add(entry.source_path);
        }
      }
    }
    if (!isRecord(current)
      || !isRecord(current.source_scope)
      || current.source_scope.sport !== "basketball"
      || current.source_scope.gender !== "women"
      || current.source_scope.division !== Number(division)
      || !isNCAAWomenStatsUrl(current.source_url)
      || !sourceUrls.has(current.source_url)
      || !Array.isArray(current.individual)
      || !Array.isArray(current.team)
      || !available
      || current.individual.some((stat) => !validStatistic(stat, sourceUrls, availablePaths.individual, "individual"))
      || current.team.some((stat) => !validStatistic(stat, sourceUrls, availablePaths.team, "team"))) return null;
  }
  return value;
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

export const womensLowerStats = new Hono<{ Bindings: Bindings }>();
womensLowerStats.get("/", zValidator("query", querySchema), async (c) => {
  if (!c.env.ASSETS) return c.json({ error: "The women's lower-division release is unavailable.", code: "release_unavailable" }, 503, { "Cache-Control": "no-store" });
  const args = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch { /* Cache failures must not hide the source release. */ }
  }
  try {
    const asset = await withTimeout(c.env.ASSETS.fetch(new Request(new URL(ASSET_PATH, c.req.url))), ASSET_TIMEOUT_MS);
    if (!asset.ok) return c.json({ error: "The women's lower-division release is unavailable.", code: "release_unavailable" }, 503, { "Cache-Control": "no-store" });
    const edition = validateEdition(await asset.json());
    if (!edition) return c.json({ error: "The women's lower-division release failed integrity validation.", code: "release_integrity_failed" }, 503, { "Cache-Control": "no-store" });
    const division = (edition.divisions as RecordValue)[`d${args.division}`] as RecordValue;
    const statistics = division[args.kind] as RecordValue[];
    if (args.meta === "1") {
      const response = c.json({
        season: division.season,
        division: args.division,
        kind: args.kind,
        available_divisions: ["2", "3"],
        statistics: statistics.map((stat) => ({ statistic: stat.statistic, label: stat.label, rows: Array.isArray(stat.rows) ? stat.rows.length : 0, source_url: stat.source_url })),
        source: edition.source,
        source_scope: division.source_scope,
        generated_at: edition.generated_at,
        source_receipts: edition.receipts,
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    }
    const selected = args.statistic ? statistics.find((stat) => stat.statistic === args.statistic) : statistics[0];
    if (!selected) return c.json({ error: "That source statistic is not published for this division.", code: "statistic_not_published", division: args.division, kind: args.kind }, 404, { "Cache-Control": "public, max-age=60" });
    const needle = args.q?.toLocaleLowerCase();
    const sourceRows = selected.rows as RecordValue[];
    const rows = needle ? sourceRows.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(needle)) : sourceRows;
    const start = args.page * args.limit;
    const pageRows = rows.slice(start, start + args.limit);
    const response = c.json({
      season: division.season,
      division: args.division,
      kind: args.kind,
      statistic: selected.statistic,
      label: selected.label,
      headers: selected.headers,
      source_url: selected.source_url,
      through_games: selected.through_games ?? division.through_games ?? null,
      total: rows.length,
      page: args.page,
      limit: args.limit,
      pages: Math.max(1, Math.ceil(rows.length / args.limit)),
      rows: pageRows,
      provenance: { publisher: "NCAA.com", identity_status: division.identity_status, identity_note: division.identity_note, generated_at: edition.generated_at },
      source_receipts: edition.receipts,
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The women's lower-division release is temporarily unavailable.", code: "release_unavailable" }, 503, { "Cache-Control": "no-store" });
  }
});
