import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

export const briefArchive = new Hono<{ Bindings: Env }>({ strict: false });
const ARCHIVE_CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("brief archive database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type BriefContext = import("hono").Context<{ Bindings: Env }>;
type BundledBrief = {
  id?: string;
  sport?: string;
  game_id?: string;
  season?: number;
  home_name?: string;
  away_name?: string;
  starts_at?: string;
  time_tbd?: number;
  model_id?: string;
  generated_at?: string;
  registered_at?: string;
};

async function bundledArchive(c: BriefContext, q: z.infer<typeof query>): Promise<Response> {
  if (!c.env.ASSETS) return c.text("Archived content temporarily unavailable", 503);
  const asset = await withTimeout(c.env.ASSETS.fetch(new Request(new URL("/data/research/briefs.json", c.req.url))), 2000);
  if (!asset.ok) return c.text("Archived content temporarily unavailable", 503);
  const payload = await asset.json() as { games?: BundledBrief[] };
  const needle = q.q.trim().toLowerCase();
  const rows = (Array.isArray(payload.games) ? payload.games : [])
    .filter((row) => (q.sport === "all" || row.sport === q.sport) && (!q.game || row.game_id === q.game))
    .filter((row) => !needle || `${row.home_name || ""} ${row.away_name || ""}`.toLowerCase().includes(needle))
    .map((row) => ({
      revision: row.id || "",
      sport: row.sport || "",
      game_id: row.game_id || "",
      season: Number(row.season || 0),
      home_name: row.home_name || "Unknown",
      away_name: row.away_name || "Unknown",
      starts_at: row.starts_at || "",
      time_tbd: Number(row.time_tbd || 0),
      model_id: row.model_id || "",
      forecast_generated_at: row.generated_at || "",
      first_recorded_at: row.registered_at || row.generated_at || "",
      sequence: 0,
      original_path: row.sport === "basketball" ? `/basketball/briefs/${row.game_id}/` : `/blog/game-${row.game_id}/`,
    }));
  const response = c.json({ rows: rows.slice(q.page * 24, (q.page + 1) * 24), total: rows.length, page: q.page, asof: 0, source: "bundled_release" });
  response.headers.set("Cache-Control", `public, max-age=${ARCHIVE_CACHE_TTL}`);
  return response;
}
const hash = /^[a-f0-9]{64}$/;
const gameID = /^\d{1,15}$/;
const query = z.object({
  sport: z.enum(["all", "football", "basketball"]).default("all"),
  q: z.string().max(80).default(""),
  game: z.string().regex(gameID).optional(),
  view: z.enum(["latest", "versions"]).default("latest"),
  page: z.coerce.number().int().min(0).max(100000).default(0),
  asof: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
briefArchive.get(
  "/api/research/briefs",
  zValidator("query", query),
  async (c) => {
    const q = c.req.valid("query");
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
    try {
      const top = await withTimeout(researchDb(c.env).prepare(
      "SELECT coalesce(max(sequence),0) AS sequence FROM brief_archive_versions",
      ).first<{ sequence: number }>(), DB_TIMEOUT_MS);
      const asof = Math.min(q.asof ?? top!.sequence, top!.sequence);
      const where =
        "sequence<=? AND (?='all' OR sport=?) AND (? IS NULL OR game_id=?)";
      const cte = `WITH snapshots AS (SELECT *,row_number() OVER (PARTITION BY sport,game_id ORDER BY sequence DESC) AS position FROM brief_archive_versions WHERE ${where}), selected AS (SELECT * FROM snapshots WHERE (?='versions' OR position=1) AND instr(lower(home_name||' '||away_name),lower(?))>0)`;
      const values = [
        asof,
        q.sport,
        q.sport,
        q.game ?? null,
        q.game ?? null,
        q.view,
        q.q,
      ];
      const [count, rows] = await withTimeout(researchDb(c.env).batch([
        researchDb(c.env).prepare(cte + " SELECT count(*) AS total FROM selected").bind(
          ...values,
        ),
        researchDb(c.env).prepare(
          cte +
            " SELECT revision,sport,game_id,season,home_name,away_name,starts_at,time_tbd,model_id,forecast_generated_at,original_path,first_recorded_at,sequence FROM selected ORDER BY starts_at,sport,game_id,sequence DESC LIMIT 24 OFFSET ?",
        ).bind(...values, q.page * 24),
      ]), DB_TIMEOUT_MS);
      const response = c.json({
        rows: rows.results,
        total: (count.results[0] as { total: number }).total,
        page: q.page,
        asof,
      });
      response.headers.set("Cache-Control", `public, max-age=${ARCHIVE_CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      const response = await bundledArchive(c, q);
      response.headers.set("X-Archive-Source", "bundled_release");
      return response;
    }
  },
);

type ObjectRow = {
  bundle_key: string;
  byte_offset: number;
  byte_length: number;
  raw_size: number;
  content_type: string;
};
export async function archiveObject(
  env: Env,
  digest: string,
  request: Request,
) {
  if (!hash.test(digest))
    return new Response("Invalid snapshot", { status: 400 });
  const row = await researchDb(env).prepare(
    "SELECT bundle_key,byte_offset,byte_length,raw_size,content_type FROM brief_archive_objects WHERE sha256=?",
  )
    .bind(digest)
    .first<ObjectRow>();
  if (!row) return new Response("Snapshot not found", { status: 404 });
  if (
    !/^brief-archive\/[a-f0-9]{64}\.pack$/.test(row.bundle_key) ||
    !["text/html", "text/css", "application/json"].includes(row.content_type) ||
    !Number.isSafeInteger(row.byte_offset) ||
    !Number.isSafeInteger(row.byte_length) ||
    !Number.isSafeInteger(row.raw_size) ||
    row.byte_offset < 0 ||
    row.byte_length <= 0 ||
    row.byte_offset + row.byte_length > Number.MAX_SAFE_INTEGER ||
    row.raw_size <= 0 ||
    row.raw_size > 10_000_000
  )
    return new Response("Invalid archive metadata", { status: 503 });
  const headers = new Headers({
    "Content-Type": row.content_type + "; charset=utf-8",
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  });
  const requestedTags = request.headers
    .get("If-None-Match")
    ?.split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""));
  if (requestedTags?.includes(`"${digest}"`))
    return new Response(null, { status: 304, headers });
  const object = await env.RESEARCH_ARCHIVE.get(row.bundle_key, {
    range: { offset: row.byte_offset, length: row.byte_length },
  });
  if (!object || !("body" in object))
    return new Response("Archived content temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(
    object.body.pipeThrough(new DecompressionStream("gzip")),
    { headers },
  );
}
briefArchive.get("/archive/brief-objects/:hash", (c) =>
  archiveObject(c.env, c.req.param("hash"), c.req.raw),
);
briefArchive.get("/archive/briefs/:sport/:game/:revision", async (c) => {
  const { sport, game, revision } = c.req.param();
  if (
    !["football", "basketball"].includes(sport) ||
    !gameID.test(game) ||
    !hash.test(revision)
  )
    return c.text("Invalid archive URL", 400);
  const found = await researchDb(c.env).prepare(
    "SELECT revision FROM brief_archive_versions WHERE sport=? AND game_id=? AND revision=?",
  )
    .bind(sport, game, revision)
    .first();
  if (!found) return c.text("Snapshot not found", 404);
  return archiveObject(c.env, revision, c.req.raw);
});

export async function retiredBrief(
  env: Env,
  request: Request,
  sport: string,
  id: string,
  asset: Response,
) {
  if (asset.status !== 404 || !gameID.test(id)) return asset;
  const row = await researchDb(env).prepare(
    "SELECT revision FROM brief_archive_versions WHERE sport=? AND game_id=? ORDER BY sequence DESC LIMIT 1",
  )
    .bind(sport, id)
    .first<{ revision: string }>();
  if (!row) return asset;
  const url = new URL(request.url);
  url.pathname = `/archive/briefs/${sport}/${id}/${row.revision}`;
  url.search = "";
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Cache-Control": "no-store" },
  });
}
