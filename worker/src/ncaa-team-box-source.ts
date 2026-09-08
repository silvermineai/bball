import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const sourceSchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026),
});

const catalogSchema = z.object({
  seasons: z.array(z.object({
    season: z.number(),
    source: z.object({ sha256: z.string() }).optional(),
  })).optional(),
});

export const ncaaTeamBoxSource = new Hono<{ Bindings: Bindings }>();

ncaaTeamBoxSource.get("/source", zValidator("query", sourceSchema), async (c) => {
  const { season } = c.req.valid("query");
  const catalogResponse = await c.env.ASSETS.fetch(
    new Request(new URL("/data/basketball/ncaa-team-box.json", c.req.url)),
  );
  if (!catalogResponse.ok) return c.text("NCAA team-box catalog is unavailable", 503);

  let digest = "";
  try {
    const catalog = catalogSchema.parse(await catalogResponse.json());
    digest = catalog.seasons?.find((entry) => entry.season === season)?.source?.sha256 || "";
  } catch {
    return c.text("NCAA team-box catalog is invalid", 503);
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) return c.text("NCAA team-box source release not found", 404);

  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_team_box_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) {
    return new Response(null, { status: 304, headers });
  }
  const object = await c.env.RESEARCH_ARCHIVE.get(
    `basketball/ncaa-team-box/${season}/${digest}.parquet`,
  );
  if (!object || !("body" in object)) return c.text("NCAA team-box source release is temporarily unavailable", 503);
  return new Response(object.body, { headers });
});
