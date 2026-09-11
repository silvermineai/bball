import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { footballDb } from "./football-db";

const DATASETS = ["rosters", "recruits", "team_talent", "returning_production"] as const;
type Dataset = (typeof DATASETS)[number];
const views = {
  rosters: { dataset: "rosters" as const, label: "Season rosters" },
  recruits: { dataset: "recruits" as const, label: "Recruiting commitments" },
  talent: { dataset: "team_talent" as const, label: "Team talent" },
  returning: { dataset: "returning_production" as const, label: "Returning production" },
} as const;
type View = keyof typeof views;
const query = z.object({
  view: z.enum(["rosters", "recruits", "talent", "returning"]).default("rosters"),
  season: z.coerce.number().int().min(2002).max(2035).default(2026),
  q: z.string().trim().max(100).default(""),
  team: z.string().regex(/^\d{1,15}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;
const searchable = "lower(s.stats_json || ' ' || COALESCE(s.team_id,'') || ' ' || COALESCE(s.athlete_id,''))";

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("football recruiting query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (row[key] != null && String(row[key]).trim()) return String(row[key]);
  return null;
}

function number(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function shape(view: View, row: Record<string, unknown>, raw: Record<string, unknown>) {
  if (view === "rosters") return {
    id: row.athlete_id ?? null,
    name: text(raw, "full_name", "athlete_display_name", "display_name", "short_name") || row.athlete_id || "Unknown player",
    team_id: row.team_id,
    team: text(raw, "team_display_name", "team_short_display_name", "team_location", "team_name") || row.team_id,
    division: text(raw, "division"),
    position: text(raw, "position_name", "position", "position_abbreviation"),
    experience: text(raw, "experience_display_value", "experience_abbreviation"),
    status: text(raw, "status_name", "status_type", "status_abbreviation"),
    active: raw.active == null ? null : String(raw.active).toLowerCase() === "true",
    height: number(raw, "height"),
    weight: number(raw, "weight"),
    recruit_ids: text(raw, "cfbd_recruit_ids"),
    source_url: text(raw, "athlete_href"),
  };
  if (view === "recruits") return {
    id: text(raw, "recruit_id"),
    name: text(raw, "player_name") || "Unknown recruit",
    team_id: row.team_id,
    team: text(raw, "team") || row.team_id,
    position: text(raw, "position"),
    stars: number(raw, "stars"),
    grade: number(raw, "grade"),
  };
  if (view === "talent") return {
    id: row.team_id,
    team_id: row.team_id,
    team: text(raw, "team") || row.team_id,
    talent_composite: number(raw, "talent_composite"),
    talent_rank: number(raw, "talent_rank"),
    blue_chip_ratio: number(raw, "blue_chip_ratio"),
    n_recruits: number(raw, "n_recruits"),
  };
  return {
    id: row.team_id,
    team_id: row.team_id,
    team: text(raw, "team", "team_name") || row.team_id,
    off_returning: number(raw, "off_returning"),
    def_returning: number(raw, "def_returning"),
    overall_returning: number(raw, "overall_returning"),
    n_returning: number(raw, "n_returning"),
    is_estimated: raw.is_estimated == null ? null : String(raw.is_estimated).toLowerCase() === "true",
  };
}

export const footballRecruiting = new Hono<{ Bindings: Env }>();
footballRecruiting.get("/", zValidator("query", query), async (c) => {
  const q = c.req.valid("query");
  const selected = views[q.view];
  const db = footballDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the recruiting desk fail.
    }
  }
  if (q.meta === "1") {
    try {
      const [seasons, datasets, receipts] = await withTimeout(Promise.all([
        db.prepare("SELECT DISTINCT season FROM football_stats WHERE dataset IN ('rosters','recruits','team_talent','returning_production') ORDER BY season DESC").all<{ season: number }>(),
        db.prepare("SELECT dataset,season,count(*) AS rows FROM football_stats WHERE dataset IN ('rosters','recruits','team_talent','returning_production') GROUP BY dataset,season ORDER BY season DESC,dataset").all<{ dataset: Dataset; season: number; rows: number }>(),
        db.prepare("SELECT dataset,season,receipt_json FROM football_sources WHERE dataset IN ('rosters','recruits','team_talent','returning_production') ORDER BY season DESC,dataset").all<{ dataset: Dataset; season: number; receipt_json: string }>(),
      ]), DB_TIMEOUT_MS);
      const response = c.json({
        seasons: seasons.results.map((row) => Number(row.season)),
        datasets: datasets.results,
        receipts: receipts.results.flatMap((row) => {
          const receipt = parseJson(row.receipt_json);
          return receipt?.url && receipt.fetched_at && receipt.sha256 ? [{ dataset: row.dataset, season: row.season, url: String(receipt.url), fetched_at: String(receipt.fetched_at), sha256: String(receipt.sha256) }] : [];
        }),
        views: Object.entries(views).map(([view, value]) => ({ view, dataset: value.dataset, label: value.label })),
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The football recruiting catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const conditions = ["s.dataset=?", "s.season=?"];
  const binds: Array<string | number> = [selected.dataset, q.season];
  if (q.team) { conditions.push("s.team_id=?"); binds.push(q.team); }
  if (q.q) { conditions.push(`${searchable} LIKE ? ESCAPE '\\'`); binds.push(`%${q.q.replace(/[\\%_]/g, (value) => `\\${value}`)}%`); }
  const where = conditions.join(" AND ");
  let count: { total: number } | null;
  let rows: { results: Array<{ record_key: string; athlete_id: string | null; team_id: string | null; stats_json: string }> };
  let receipts: { results: Array<{ dataset: Dataset; season: number; receipt_json: string }> };
  try {
    [count, rows, receipts] = await withTimeout(Promise.all([
      db.prepare(`SELECT count(*) AS total FROM football_stats s WHERE ${where}`).bind(...binds).first<{ total: number }>(),
      db.prepare(`SELECT record_key,athlete_id,team_id,stats_json FROM football_stats s WHERE ${where} ORDER BY record_key LIMIT ? OFFSET ?`).bind(...binds, q.limit, q.page * q.limit).all<{ record_key: string; athlete_id: string | null; team_id: string | null; stats_json: string }>(),
      db.prepare("SELECT dataset,season,receipt_json FROM football_sources WHERE dataset=? AND season=?").bind(selected.dataset, q.season).all<{ dataset: Dataset; season: number; receipt_json: string }>(),
    ]), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The football recruiting archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  const response = c.json({
    view: q.view,
    dataset: selected.dataset,
    label: selected.label,
    season: q.season,
    page: q.page,
    page_size: q.limit,
    total: Number(count?.total || 0),
    filters: { q: q.q, team: q.team ?? null },
    source_receipts: receipts.results.flatMap((row) => {
      const receipt = parseJson(row.receipt_json);
      return receipt?.url && receipt.fetched_at && receipt.sha256 ? [{ dataset: row.dataset, season: row.season, url: String(receipt.url), fetched_at: String(receipt.fetched_at), sha256: String(receipt.sha256) }] : [];
    }),
    rows: rows.results.flatMap((row) => {
      const raw = parseJson(row.stats_json);
      return raw ? [{ ...shape(q.view, row, raw), record_key: row.record_key, raw }] : [];
    }),
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});
