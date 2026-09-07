import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const briefArchive = new Hono<{ Bindings: Env }>({ strict: false });
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
    const top = await c.env.DB.prepare(
      "SELECT coalesce(max(sequence),0) AS sequence FROM brief_archive_versions",
    ).first<{ sequence: number }>();
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
    const [count, rows] = await c.env.DB.batch([
      c.env.DB.prepare(cte + " SELECT count(*) AS total FROM selected").bind(
        ...values,
      ),
      c.env.DB.prepare(
        cte +
          " SELECT revision,sport,game_id,season,home_name,away_name,starts_at,time_tbd,model_id,forecast_generated_at,original_path,first_recorded_at,sequence FROM selected ORDER BY starts_at,sport,game_id,sequence DESC LIMIT 24 OFFSET ?",
      ).bind(...values, q.page * 24),
    ]);
    c.header("Cache-Control", "no-store");
    return c.json({
      rows: rows.results,
      total: (count.results[0] as { total: number }).total,
      page: q.page,
      asof,
    });
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
  const row = await env.DB.prepare(
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
  const found = await c.env.DB.prepare(
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
  const row = await env.DB.prepare(
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
