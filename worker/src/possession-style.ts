import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

const query = z.object({
  season: z.coerce.number().int().min(2010).max(2026).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(250).default(0),
  sort: z.enum(["possessions", "ppp", "transition", "assisted", "garbage", "name"]).default("possessions"),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

const orderBy = {
  possessions: "p.possessions",
  ppp: "json_extract(p.style_json, '$.points_per_possession')",
  transition: "json_extract(p.style_json, '$.transition_share')",
  assisted: "json_extract(p.style_json, '$.assisted_share')",
  garbage: "json_extract(p.style_json, '$.garbage_time_share')",
  name: "p.team_name",
} as const;

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("possession style query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

export const possessionStyle = new Hono<{ Bindings: Env }>();

possessionStyle.get("/", zValidator("query", query), async (c) => {
  const q = c.req.valid("query");
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the style archive fail.
    }
  }
  if (q.meta === "1") {
    try {
      const [seasons, sources] = await withTimeout(db.batch([
        db.prepare("SELECT DISTINCT season FROM bb_possession_style ORDER BY season DESC"),
        db.prepare("SELECT season,receipt_json FROM bb_sources WHERE dataset='ncaa_possessions' ORDER BY season DESC"),
      ]), DB_TIMEOUT_MS);
    const sourceReceipts = sources.results.flatMap((item) => {
      const row = item as { season?: unknown; receipt_json?: unknown };
      if (typeof row.season !== "number" || typeof row.receipt_json !== "string") return [];
      try {
        const receipt = JSON.parse(row.receipt_json) as { url?: unknown; fetched_at?: unknown; sha256?: unknown };
        return typeof receipt.url === "string" && typeof receipt.fetched_at === "string" && typeof receipt.sha256 === "string"
          ? [{ season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }]
          : [];
      } catch {
        return [];
      }
    });
      const response = c.json({ seasons: seasons.results.map((item) => Number((item as { season: number }).season)), source_receipts: sourceReceipts });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The possession-style catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const where: string[] = [];
  const binds: Array<string | number> = [];
  if (q.season !== undefined) {
    where.push("p.season=?");
    binds.push(q.season);
  }
  if (q.q) {
    where.push("(p.team_name LIKE ? OR p.team_id LIKE ?)");
    const search = `%${q.q}%`;
    binds.push(search, search);
  }
  const predicate = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    const [count, rows] = await withTimeout(Promise.all([
      db.prepare(`SELECT count(*) AS total FROM bb_possession_style p ${predicate}`).bind(...binds).first<{ total: number }>(),
      db.prepare(`SELECT p.season,p.team_id,p.team_name,p.games,p.possessions,p.points,p.style_json
      FROM bb_possession_style p ${predicate}
      ORDER BY ${orderBy[q.sort]} ${q.direction === "asc" ? "ASC" : "DESC"},p.season DESC,p.team_name,p.team_id
      LIMIT 40 OFFSET ?`).bind(...binds, q.page * 40).all(),
    ]), DB_TIMEOUT_MS);
    const response = c.json({
    season: q.season ?? null,
    page: q.page,
    page_size: 40,
    total: count?.total ?? 0,
    sort: q.sort,
    direction: q.direction,
    rows: rows.results.map((item) => {
      const row = item as { style_json: string; [key: string]: unknown };
      let style: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(row.style_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) style = parsed as Record<string, unknown>;
      } catch {
        // Keep the row visible with unavailable derived rates.
      }
      const { style_json: _styleJson, ...base } = row;
      return { ...base, ...style };
    }),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The possession-style archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
