import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const query = z.object({ season: z.coerce.number().int().min(2011).max(2026) });

/** Stream the exact league-wide NCAA RAPM release named by the impact catalog. */
export const impactSource = new Hono<{ Bindings: Bindings }>();

impactSource.get("/source", zValidator("query", query), async (c) => {
  const { season } = c.req.valid("query");
  const catalogResponse = await c.env.ASSETS.fetch(
    new Request(new URL("/data/basketball/impact.json", c.req.url)),
  );
  if (!catalogResponse.ok) return c.text("Impact catalog is unavailable", 503);

  let digest = "";
  try {
    const catalog = (await catalogResponse.json()) as {
      seasons?: Array<{ season?: unknown; source?: { sha256?: unknown } }>;
    };
    const entry = catalog.seasons?.find((item) => Number(item.season) === season);
    digest = typeof entry?.source?.sha256 === "string" ? entry.source.sha256 : "";
  } catch {
    return c.text("Impact catalog is invalid", 503);
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) return c.text("Impact source release not found", 404);

  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_rapm_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) {
    return new Response(null, { status: 304, headers });
  }
  const object = await c.env.RESEARCH_ARCHIVE.get(
    `basketball/ncaa-rapm/${season}/${digest}.parquet`,
  );
  if (!object || !("body" in object)) return c.text("Impact source release is temporarily unavailable", 503);
  return new Response(object.body, { headers });
});
