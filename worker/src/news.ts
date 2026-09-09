import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const querySchema = z.object({
  sport: z.string().trim().regex(/^[a-z0-9-]{2,80}$/).default("mens-college-basketball"),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  meta: z.enum(["0", "1"]).default("0"),
});

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export const news = new Hono<{ Bindings: Env }>();

news.get("/", zValidator("query", querySchema), async (c) => {
  const { sport, q, page, limit, meta } = c.req.valid("query");
  const search = q ? `%${escapeLike(q)}%` : null;
  const where = search
    ? "sport=? AND (headline LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR categories_json LIKE ? ESCAPE '\\')"
    : "sport=?";
  const binds: Array<string | number> = search
    ? [sport, search, search, search]
    : [sport];

  if (meta === "1") {
    const [summary, releases] = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT count(*) AS total, max(published) AS latest_published,
                max(last_seen_at) AS latest_seen_at
           FROM bb_news_articles WHERE ${where}`,
      ).bind(...binds),
      c.env.DB.prepare(
        "SELECT edition,generated_at,article_count,feeds_json FROM bb_news_releases ORDER BY generated_at DESC LIMIT 12",
      ),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      sport,
      q: q || "",
      summary: summary.results[0],
      releases: releases.results.map((row) => {
        const item = row as Record<string, unknown>;
        let feeds: unknown[] = [];
        try {
          const parsed = JSON.parse(String(item.feeds_json || "[]"));
          if (Array.isArray(parsed)) feeds = parsed;
        } catch {
          // Keep a malformed release catalog visible without failing the endpoint.
        }
        return { ...item, feeds };
      }),
    });
  }

  const [count, rows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT count(*) AS total FROM bb_news_articles WHERE ${where}`).bind(...binds),
    c.env.DB.prepare(
      `SELECT id,publisher,sport,headline,description,published,link,categories_json,author,first_seen_at,last_seen_at
         FROM bb_news_articles WHERE ${where}
        ORDER BY published DESC,id DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, limit, page * limit),
  ]);
  const parsedRows = rows.results.map((row) => {
    const item = row as Record<string, unknown>;
    let categories: string[] = [];
    try {
      const parsed = JSON.parse(String(item.categories_json || "[]"));
      if (Array.isArray(parsed)) categories = parsed.filter((value): value is string => typeof value === "string");
    } catch {
      // A malformed category list should not hide an otherwise valid headline.
    }
    const { categories_json: _categories, ...rest } = item;
    return { ...rest, categories };
  });
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ sport, q: q || "", page, page_size: limit, total: Number((count.results[0] as { total?: number }).total || 0), rows: parsedRows });
});
