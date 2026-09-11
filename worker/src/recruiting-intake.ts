import { researchDb } from "./research-db";
import { Hono } from "hono";

/**
 * Coverage-only view of operator-imported recruiting evidence. The licensed
 * row payload stays in D1; this endpoint publishes counts and clocks, not a
 * public mirror of a provider export.
 */
export const recruitingIntake = new Hono<{ Bindings: Env }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("recruiting intake database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const providerCapabilities = [
  {
    provider: "CollegeBasketballData.com API",
    kinds: ["portal", "players", "teams"],
    season_field: "year",
    event_date_available: false,
    docs_url: "https://api.collegebasketballdata.com/api/recruiting",
    policy: "Season-level provider records stay separate from dated school announcements.",
  },
];

recruitingIntake.get("/", async (c) => {
  const value = c.req.query("season") ?? "2027";
  if (!/^\d{4}$/.test(value) || +value < 2025 || +value > 2035)
    return c.json({ error: "Invalid recruiting intake season" }, 400);
  const season = +value;
  const cache = typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the coverage endpoint fail.
    }
  }
  try {
    const [summary, providers, statuses, providerFeeds] = await withTimeout(Promise.all([
      researchDb(c.env).prepare(
        `SELECT count(*) AS total, max(captured_at) AS latest_captured_at
         FROM bb_recruiting_intake WHERE season=?`,
      ).bind(season).first<{ total: number; latest_captured_at: string | null }>(),
      researchDb(c.env).prepare(
        `SELECT provider, count(*) AS rows, max(captured_at) AS latest_captured_at
         FROM bb_recruiting_intake WHERE season=? GROUP BY provider ORDER BY latest_captured_at DESC, provider`,
      ).bind(season).all<{ provider: string; rows: number; latest_captured_at: string | null }>(),
      researchDb(c.env).prepare(
        `SELECT status, count(*) AS rows FROM bb_recruiting_intake
         WHERE season=? GROUP BY status ORDER BY status`,
      ).bind(season).all<{ status: string; rows: number }>(),
      researchDb(c.env).prepare(
        `SELECT provider, kind, count(*) AS rows, max(captured_at) AS latest_captured_at
         FROM bb_cbbd_recruiting WHERE season=?
         GROUP BY provider, kind ORDER BY latest_captured_at DESC, provider, kind`,
      ).bind(season).all<{ provider: string; kind: string; rows: number; latest_captured_at: string | null }>(),
    ]), DB_TIMEOUT_MS);
    const response = c.json({
      season,
      total: summary?.total ?? 0,
      latest_captured_at: summary?.latest_captured_at ?? null,
      providers: providers.results,
      statuses: statuses.results,
      provider_feeds: providerFeeds.results,
      provider_capabilities: providerCapabilities,
      policy: "Coverage metadata only. Source-reported rows remain in the authorized D1 intake and are not republished as a provider-feed mirror.",
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({
      season,
      total: 0,
      latest_captured_at: null,
      providers: [],
      statuses: [],
      provider_feeds: [],
      provider_capabilities: providerCapabilities,
      source: "unavailable",
      unavailable_reason: "The recruiting coverage warehouse did not respond within the read window.",
      policy: "Coverage metadata only. Source-reported rows remain in the authorized D1 intake and are not republished as a provider-feed mirror.",
    }, 200, { "Cache-Control": "no-store" });
  }
});
