import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = [
  { key: "net_per_100", label: "Net rating", unit: "points per 100 possessions" },
  { key: "off_rtg", label: "Offensive rating", unit: "points per 100 possessions" },
  { key: "def_rtg", label: "Defensive rating", unit: "points per 100 possessions" },
  { key: "poss", label: "Possessions", unit: "possessions" },
  { key: "duration_mins", label: "Minutes", unit: "minutes" },
  { key: "games", label: "Games", unit: "games" },
  { key: "plus_minus", label: "Point margin", unit: "points" },
] as const;
const schema = z.object({
  season: z.coerce.number().int().min(2019).max(2026).default(2026),
  metric: z.string().regex(/^[a-z0-9_]{2,20}$/).default("net_per_100"),
  q: z.string().trim().max(120).optional(),
  minPoss: z.coerce.number().int().min(0).max(5000).default(40),
  page: z.coerce.number().int().min(0).max(250).default(0),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("lineup archive query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

export const lineups = new Hono<{ Bindings: Bindings }>();
lineups.get("/", zValidator("query", schema), async (c) => {
  const { season, metric: requested, q, minPoss, page, direction, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the lineup browser fail.
    }
  }
  if (meta === "1") {
    try {
      const available = await withTimeout(db.prepare("SELECT DISTINCT season FROM bb_lineups ORDER BY season DESC").all<{ season: number }>(), DB_TIMEOUT_MS);
      const response = c.json({ seasons: available.results.map((row) => row.season), metrics });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The lineup catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const metric = metrics.find((m) => m.key === requested);
  if (!metric) return c.json({ error: "Unknown lineup metric" }, 400);
  const path = `$.${metric.key}`;
  const search = q ? `%${q}%` : null;
  const where = search
    ? "season=? AND json_extract(stats_json,'$.poss')>=? AND (team_name LIKE ? OR players_json LIKE ?)"
    : "season=? AND json_extract(stats_json,'$.poss')>=?";
  const binds: Array<string | number> = search ? [season, minPoss, search, search] : [season, minPoss];
  try {
    const count = await withTimeout(db.prepare(`SELECT count(*) AS total, count(json_extract(stats_json, ?)) AS non_null FROM bb_lineups WHERE ${where}`).bind(path, ...binds).first<{ total: number; non_null: number }>(), DB_TIMEOUT_MS);
    const order = `json_extract(stats_json, '${path}') IS NULL, json_extract(stats_json, '${path}') ${direction === "asc" ? "ASC" : "DESC"}, team_name ASC, lineup_key ASC`;
    const rows = await withTimeout(db.prepare(`SELECT lineup_key,team_name,players_json,stats_json FROM bb_lineups WHERE ${where} ORDER BY ${order} LIMIT 40 OFFSET ?`).bind(...binds, page * 40).all<{ lineup_key: string; team_name: string; players_json: string; stats_json: string }>(), DB_TIMEOUT_MS);
    const response = c.json({
    season, metric, min_poss: minPoss, page, page_size: 40,
    total: count?.total ?? 0, non_null: count?.non_null ?? 0,
    rows: rows.results.flatMap((row) => {
      try {
        const stats = JSON.parse(row.stats_json) as Record<string, number | null>;
        const players = JSON.parse(row.players_json);
        if (!stats || typeof stats !== "object" || !Array.isArray(players)) return [];
        return [{ id: row.lineup_key, team: row.team_name, players, value: stats[metric.key] ?? null, stats }];
      } catch {
        return [];
      }
    }),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The lineup archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
