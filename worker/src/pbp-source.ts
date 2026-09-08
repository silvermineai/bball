import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const sourceSchema = z.object({
  season: z.coerce.number().int().min(2019).max(2026),
});

type PbpCatalog = {
  seasons?: Array<{
    season?: unknown;
    source?: { sha256?: unknown };
  }>;
};

/**
 * Stream the exact attributed PBP release retained in R2. The public catalog
 * remains the authority for the release hash; the route never accepts a key
 * from the caller, so a request cannot traverse arbitrary R2 objects.
 */
export const pbpSource = new Hono<{ Bindings: Bindings }>();

pbpSource.get("/source", zValidator("query", sourceSchema), async (c) => {
  const { season } = c.req.valid("query");
  const catalogResponse = await c.env.ASSETS.fetch(
    new Request(new URL("/data/basketball/pbp-catalog.json", c.req.url)),
  );
  if (!catalogResponse.ok) return c.text("PBP source catalog is unavailable", 503);

  let receipt: { season?: unknown; sha256?: unknown } | undefined;
  try {
    const catalog = (await catalogResponse.json()) as PbpCatalog;
    receipt = catalog.seasons?.find((entry) => Number(entry.season) === season)?.source;
  } catch {
    return c.text("PBP source catalog is invalid", 503);
  }

  const digest = typeof receipt?.sha256 === "string" ? receipt.sha256 : "";
  if (!receipt || !/^[a-f0-9]{64}$/.test(digest)) {
    return c.text("PBP source release not found", 404);
  }

  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="play_by_play_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) {
    return new Response(null, { status: 304, headers });
  }

  const object = await c.env.RESEARCH_ARCHIVE.get(
    `basketball/pbp/${season}/${digest}.parquet`,
  );
  if (!object || !("body" in object)) {
    return c.text("PBP source release is temporarily unavailable", 503);
  }
  return new Response(object.body, { headers });
});
