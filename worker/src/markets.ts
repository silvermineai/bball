import { researchDb } from "./research-db";
import { footballDb } from "./football-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  sport: z.enum(["football", "basketball"]).default("football"),
  season: z.union([z.coerce.number().int().min(2022).max(2035), z.literal("all")]).default(2025),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const markets = new Hono<{ Bindings: Bindings }>();
const CACHE_TTL = 300;
// D1 can briefly queue a read behind a refresh batch. Keep the request bounded
// while allowing the two independent archive bindings to resolve in parallel.
const DB_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("market archive database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const providerCapabilities = [
  {
    provider: "The Odds API",
    sports: ["football", "basketball"],
    markets: ["h2h", "spreads", "totals"],
    provider_update_clock: true,
    docs_url: "https://the-odds-api.com/liveapi/guides/v4/",
    policy: "Pregame provider-update and capture clocks are required before prospective comparison.",
  },
  {
    provider: "CollegeBasketballData.com API",
    sports: ["basketball"],
    markets: ["h2h"],
    provider_update_clock: false,
    docs_url: "https://api.collegebasketballdata.com/api/lines",
    policy: "The lines endpoint has a game start clock but no quote update clock; only captured pregame moneylines qualify.",
  },
  {
    provider: "ESPN Summary",
    sports: ["basketball"],
    markets: ["h2h", "spreads", "totals"],
    provider_update_clock: false,
    docs_url: "https://www.espn.com/mens-college-basketball/",
      policy: "Public summary pickcenter values are captured prospectively with the observation clock; exact event, participant and start-time checks are required, and historical summaries are not replayed.",
  },
  {
    provider: "ESPN Summary",
    sports: ["football"],
    markets: ["h2h", "spreads", "totals"],
    provider_update_clock: false,
    docs_url: "https://www.espn.com/college-football/",
    policy: "Public summary pickcenter values are captured prospectively with the observation clock; exact event, participant and start-time checks are required, and historical summaries are not replayed.",
  },
];

type ArchiveReceipt = {
  dataset: string;
  season: number;
  url: string;
  fetched_at: string;
  sha256: string;
  attribution?: {
    name?: string;
    url?: string;
    license?: string;
    license_url?: string;
    upstream?: string;
  };
};

function parseArchiveReceipts(value: unknown): ArchiveReceipt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as { dataset?: unknown; season?: unknown; receipt_json?: unknown };
    if (typeof item.dataset !== "string" || typeof item.season !== "number" || !Number.isInteger(item.season) || typeof item.receipt_json !== "string") return [];
    try {
      const receipt = JSON.parse(item.receipt_json) as Record<string, unknown>;
      if (typeof receipt.url !== "string" || typeof receipt.fetched_at !== "string" || typeof receipt.sha256 !== "string") return [];
      const rawAttribution = receipt.attribution;
      const attribution = rawAttribution && typeof rawAttribution === "object" && !Array.isArray(rawAttribution)
        ? rawAttribution as ArchiveReceipt["attribution"]
        : undefined;
      return [{
        dataset: item.dataset,
        season: item.season,
        url: receipt.url,
        fetched_at: receipt.fetched_at,
        sha256: receipt.sha256,
        ...(attribution ? { attribution } : {}),
      } satisfies ArchiveReceipt];
    } catch {
      return [];
    }
  });
}

markets.get("/", zValidator("query", querySchema), async (c) => {
  const { sport, season, q, page, meta } = c.req.valid("query");
  const football = sport === "football";
  // ESPN Summary football captures live in the append-only research ledger;
  // the historical SportsDataverse betting archive remains in FOOTBALL_DB.
  // Keep the current-season view pointed at the clocked ledger rows while
  // preserving the established archive for prior seasons.
  const useFootballLedger = football && season === 2026 && meta !== "1";
  const hasResearchBinding = Boolean((c.env as Env & { RESEARCH_DB?: D1Database }).RESEARCH_DB);
  // The established football archive uses football_markets in the legacy
  // store; basketball quotes use the append-only audit ledger in research D1.
  const db = football ? footballDb(c.env) : researchDb(c.env);
  const cache = typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the archive fail.
    }
  }
  if (meta === "1") {
    try {
      // Legacy football and append-only research reads are independent. A
      // busy archive should not erase the other binding's useful coverage.
      const legacyPromise = football
        ? withTimeout(db.batch([
          db.prepare("SELECT DISTINCT g.season FROM football_markets m JOIN football_games g ON g.id=m.game_id ORDER BY g.season DESC"),
          db.prepare("SELECT count(*) AS total, sum(is_pregame) AS pregame FROM football_markets"),
          db.prepare("SELECT dataset,season,receipt_json FROM football_sources WHERE dataset='betting' ORDER BY season DESC"),
        ]), DB_TIMEOUT_MS)
        : Promise.resolve(null);
      // In production the split binding is present. Older local fixtures may
      // only provide the legacy DB, so do not issue a duplicate batch there.
      const ledgerPromise = (!football || hasResearchBinding)
        ? withTimeout(researchDb(c.env).batch([
          researchDb(c.env).prepare("SELECT DISTINCT g.season FROM audit_markets m JOIN bb_games g ON g.id=m.game_id WHERE m.sport=? ORDER BY g.season DESC").bind(sport),
          researchDb(c.env).prepare("SELECT count(*) AS total FROM audit_markets WHERE sport=?").bind(sport),
          researchDb(c.env).prepare("SELECT count(*) AS receipts, max(captured_at) AS latest_captured_at FROM audit_receipts WHERE json_extract(payload_json,'$.sport')=?").bind(sport),
        ]), DB_TIMEOUT_MS)
        : Promise.resolve(null);
      const [legacyResult, ledgerResult] = await Promise.allSettled([legacyPromise, ledgerPromise]);
      const legacy = legacyResult.status === "fulfilled" ? legacyResult.value : null;
      const ledger = ledgerResult.status === "fulfilled" ? ledgerResult.value : null;
      // Preserve the explicit unavailable contract when the only applicable
      // archive failed, while retaining partial metadata when another source
      // answered successfully.
      const legacyFailed = legacyResult.status === "rejected";
      const ledgerFailed = ledgerResult.status === "rejected";
      const legacyUnavailable = football && legacyFailed;
      const ledgerUnavailable = (!football || hasResearchBinding) && ledgerFailed;
      if (legacyUnavailable && ledgerUnavailable) {
        throw new Error("all applicable market archive reads failed");
      }
      const legacySeasons = legacy?.[0]?.results || [];
      const ledgerSeasons = ledger?.[0]?.results || [];
      const seasons = [...new Set([
        ...legacySeasons.map((row) => Number((row as { season: number }).season)),
        ...ledgerSeasons.map((row) => Number((row as { season: number }).season)),
      ])].sort((a, b) => b - a);
      const legacyArchive = (legacy?.[1]?.results[0] || {}) as { total?: number; pregame?: number | null };
      const ledgerArchive = (ledger?.[1]?.results[0] || {}) as { total?: number };
      const ledgerReceipts = (ledger?.[2]?.results[0] || {}) as { receipts?: number; latest_captured_at?: string | null };
      const receipts = legacy?.[2]?.results || [];
      const response = c.json({
        sport,
        seasons,
        total: Number(legacyArchive.total || 0) + Number(ledgerArchive.total || 0),
        pregame: Number(legacyArchive.pregame || 0) + Number(ledgerArchive.total || 0),
        research_receipts: Number(ledgerReceipts.receipts || 0),
        research_latest_capture_at: ledgerReceipts.latest_captured_at || null,
        provider_capabilities: providerCapabilities.filter((item) => item.sports.includes(sport)),
        archive_receipts: parseArchiveReceipts(receipts),
        ...(legacyFailed || ledgerFailed
          ? { source: "partial", unavailable_sources: [legacyFailed ? "legacy" : null, ledgerFailed ? "research" : null].filter((value): value is string => value !== null) }
          : {}),
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({
        sport,
        seasons: [],
        total: 0,
        pregame: 0,
        research_receipts: 0,
        research_latest_capture_at: null,
        provider_capabilities: providerCapabilities.filter((item) => item.sports.includes(sport)),
        source: "unavailable",
        unavailable_reason: "The market archive warehouse did not respond within the read window.",
      }, 200, { "Cache-Control": "no-store" });
    }
  }
  const search = q ? `%${q}%` : null;
  const seasonClause = season === "all" ? "" : (useFootballLedger ? "json_extract(m.payload_json,'$.season')=? AND " : "g.season=? AND ");
  const where = useFootballLedger
    ? search
      ? `${seasonClause}m.sport=? AND (json_extract(m.payload_json,'$.home_name') LIKE ? OR json_extract(m.payload_json,'$.away_name') LIKE ? OR m.provider LIKE ? OR m.bookmaker LIKE ?)`
      : `${seasonClause}m.sport=?`
    : football
    ? search
      ? `${seasonClause}(g.home_name LIKE ? OR g.away_name LIKE ? OR m.source LIKE ?)`
      : (season === "all" ? "1=1" : "g.season=?")
    : search
      ? `${seasonClause}m.sport=? AND (g.home_name LIKE ? OR g.away_name LIKE ? OR m.provider LIKE ? OR m.bookmaker LIKE ?)`
      : `${seasonClause}m.sport=?`;
  const binds: Array<string | number> = useFootballLedger
    ? search
      ? [season as number, sport, search, search, search, search]
      : [season as number, sport]
    : football
    ? search
      ? (season === "all" ? [search, search, search] : [season, search, search, search])
      : (season === "all" ? [] : [season])
    : search
      ? (season === "all" ? [sport, search, search, search, search] : [season, sport, search, search, search, search])
      : (season === "all" ? [sport] : [season, sport]);
  const marketTable = useFootballLedger ? "audit_markets" : (football ? "football_markets" : "audit_markets");
  const gameTable = useFootballLedger ? "" : (football ? "football_games" : "bb_games");
  const queryDb = useFootballLedger ? researchDb(c.env) : db;
  const fromClause = useFootballLedger
    ? `${marketTable} m`
    : `${marketTable} m JOIN ${gameTable} g ON g.id=m.game_id`;
  try {
    const count = await withTimeout(queryDb.prepare(
      `SELECT count(*) AS total FROM ${fromClause} WHERE ${where}`,
    ).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
    const rows = await withTimeout(queryDb.prepare(
      football && !useFootballLedger
        ? `SELECT m.game_id,g.season,g.kickoff,g.home_name,g.away_name,
                m.home_spread,m.total,m.observed_at,m.source,m.is_pregame,
                NULL AS updated_at,
                NULL AS home_price,NULL AS away_price,NULL AS over_price,NULL AS under_price,
                NULL AS market,NULL AS bookmaker,NULL AS provider
           FROM football_markets m JOIN football_games g ON g.id=m.game_id
          WHERE ${where}
          ORDER BY g.kickoff DESC,m.observed_at DESC,m.game_id DESC LIMIT 40 OFFSET ?`
        : useFootballLedger
        ? `SELECT m.game_id,
                CAST(json_extract(m.payload_json,'$.season') AS INTEGER) AS season,
                json_extract(m.payload_json,'$.starts_at') AS kickoff,
                json_extract(m.payload_json,'$.home_name') AS home_name,
                json_extract(m.payload_json,'$.away_name') AS away_name,
                CASE WHEN m.market='spreads' THEN json_extract(m.payload_json,'$.line') END AS home_spread,
                CASE WHEN m.market='totals' THEN json_extract(m.payload_json,'$.line') END AS total,
                json_extract(m.payload_json,'$.home_price') AS home_price,
                json_extract(m.payload_json,'$.away_price') AS away_price,
                json_extract(m.payload_json,'$.over_price') AS over_price,
                json_extract(m.payload_json,'$.under_price') AS under_price,
                m.captured_at AS observed_at,m.updated_at AS updated_at,m.provider AS source,1 AS is_pregame,
                m.market,m.bookmaker,m.provider
           FROM audit_markets m
          WHERE ${where}
          ORDER BY kickoff DESC,m.captured_at DESC,m.game_id DESC LIMIT 40 OFFSET ?`
        : `SELECT m.game_id,g.season,g.starts_at AS kickoff,g.home_name,g.away_name,
                CASE WHEN m.market='spreads' THEN json_extract(m.payload_json,'$.line') END AS home_spread,
                CASE WHEN m.market='totals' THEN json_extract(m.payload_json,'$.line') END AS total,
                json_extract(m.payload_json,'$.home_price') AS home_price,
                json_extract(m.payload_json,'$.away_price') AS away_price,
                json_extract(m.payload_json,'$.over_price') AS over_price,
                json_extract(m.payload_json,'$.under_price') AS under_price,
                m.captured_at AS observed_at,m.updated_at AS updated_at,m.provider AS source,1 AS is_pregame,
                m.market,m.bookmaker,m.provider
           FROM audit_markets m JOIN bb_games g ON g.id=m.game_id
          WHERE ${where}
          ORDER BY g.starts_at DESC,m.captured_at DESC,m.game_id DESC LIMIT 40 OFFSET ?`,
    ).bind(...binds, page * 40).all(), DB_TIMEOUT_MS);
    const response = c.json({
      sport,
      season,
      page,
      page_size: 40,
      total: count?.total ?? 0,
      rows: rows.results,
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({
      sport,
      season,
      page,
      page_size: 40,
      total: 0,
      rows: [],
      source: "unavailable",
      unavailable_reason: "The market archive warehouse did not respond within the read window.",
    }, 200, { "Cache-Control": "no-store" });
  }
});
