import { researchDb } from "./research-db";
import { Hono } from "hono";
export const recruiting = new Hono<{ Bindings: Env }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("recruiting edition database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
recruiting.get("/", async (c) => {
  const value = c.req.query("season") ?? "2027";
  if (!/^\d{4}$/.test(value) || +value < 2025 || +value > 2035)
    return c.json({ error: "Invalid recruiting season" }, 400);
  const cache = typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the recruiting edition fail.
    }
  }
  try {
    const row = await withTimeout(researchDb(c.env).prepare(
      `SELECT r.payload_json,r.first_recorded_at
      FROM bb_recruiting_releases r JOIN bb_recruiting_current a ON a.edition=r.edition AND a.season=r.season
      WHERE a.season=?`,
    )
      .bind(+value)
      .first<{ payload_json: string; first_recorded_at: string }>(), DB_TIMEOUT_MS);
    if (!row)
      return c.json(
        { error: "No reviewed recruiting edition for this season" },
        404,
      );
    const response = c.json({
      ...JSON.parse(row.payload_json),
      first_recorded_at: row.first_recorded_at,
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The reviewed recruiting edition is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
