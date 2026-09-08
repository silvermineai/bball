import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const query = z.object({ season: z.coerce.number().int().min(2019).max(2026) });

/** Stream the exact NCAA lineup release whose receipt is active in D1. */
export const lineupSource = new Hono<{ Bindings: Bindings }>();

lineupSource.get("/source", zValidator("query", query), async (c) => {
  const { season } = c.req.valid("query");
  const row = await c.env.DB.prepare(
    "SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?",
  ).bind("ncaa_lineups", season).first<{ receipt_json: string }>();
  let digest = "";
  try {
    const receipt = row?.receipt_json ? JSON.parse(row.receipt_json) as { sha256?: unknown } : null;
    digest = typeof receipt?.sha256 === "string" ? receipt.sha256 : "";
  } catch {
    return c.text("Lineup source receipt is invalid", 503);
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) return c.text("Lineup source release not found", 404);
  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_lineups_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) return new Response(null, { status: 304, headers });
  const object = await c.env.RESEARCH_ARCHIVE.get(`basketball/lineups/${season}/${digest}.parquet`);
  if (!object || !("body" in object)) return c.text("Lineup source release is temporarily unavailable", 503);
  return new Response(object.body, { headers });
});
