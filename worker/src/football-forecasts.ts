import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2022).max(2035).default(2026),
  status: z.enum(["all", "upcoming", "completed"]).default("all"),
  q: z.string().trim().max(120).optional(),
  model: z.union([
    z.literal("latest"),
    z.literal("all"),
    z.string().trim().regex(/^[A-Za-z0-9._-]{1,120}$/),
  ]).default("latest"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  meta: z.enum(["0", "1"]).default("0"),
});

export const footballForecasts = new Hono<{ Bindings: Bindings }>();

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

footballForecasts.get("/", zValidator("query", querySchema), async (c) => {
  const { season, status, q, model, page, limit, meta } = c.req.valid("query");
  const latestModel = await c.env.DB.prepare(
    "SELECT id,created_at,cutoff,artifact_json FROM football_models ORDER BY created_at DESC,id DESC LIMIT 1",
  ).first<{ id: string; created_at: string; cutoff: string; artifact_json: string }>();

  if (meta === "1") {
    const [seasons, models] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT DISTINCT season FROM football_games ORDER BY season DESC"),
      c.env.DB.prepare(
        "SELECT p.model_id,count(*) AS forecasts,MIN(p.created_at) AS first_created_at,MAX(p.created_at) AS last_created_at FROM football_predictions p GROUP BY p.model_id ORDER BY last_created_at DESC,model_id",
      ),
    ]);
    const metadata = models.results.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        forecasts: Number(item.forecasts || 0),
      };
    });
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      latest_model: latestModel ? {
        model_id: latestModel.id,
        created_at: latestModel.created_at,
        cutoff: latestModel.cutoff,
      } : null,
      models: metadata,
    });
  }

  const clauses = ["g.season=?"];
  const binds: Array<string | number> = [season];
  if (status === "upcoming") {
    clauses.push("g.completed=0", "g.kickoff>?");
    binds.push(new Date().toISOString());
  } else if (status === "completed") {
    clauses.push("g.completed=1");
  }
  if (q) {
    const search = `%${escapeLike(q)}%`;
    clauses.push("(g.home_name LIKE ? ESCAPE '\\' OR g.away_name LIKE ? ESCAPE '\\')");
    binds.push(search, search);
  }
  if (model === "latest") {
    if (!latestModel) {
      c.header("Cache-Control", "public, max-age=300");
      return c.json({ season, status, model, query: q || null, page, page_size: limit, total: 0, rows: [] });
    }
    clauses.push("p.model_id=?");
    binds.push(latestModel.id);
  } else if (model !== "all") {
    clauses.push("p.model_id=?");
    binds.push(model);
  }
  const where = clauses.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total FROM football_predictions p JOIN football_games g ON g.id=p.game_id WHERE ${where}`,
  ).bind(...binds).first<{ total: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT p.game_id,p.model_id,p.created_at,p.home_margin,p.total,p.home_win_probability,
            g.season,g.kickoff,g.home_id,g.away_id,g.home_name,g.away_name,
            g.home_conference,g.away_conference,g.home_division,g.away_division,
            g.home_score,g.away_score,g.completed,g.neutral,g.week,g.venue,g.time_tbd
       FROM football_predictions p JOIN football_games g ON g.id=p.game_id
      WHERE ${where}
      ORDER BY g.kickoff ASC,p.created_at DESC,p.model_id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, limit, page * limit).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    status,
    model,
    query: q || null,
    page,
    page_size: limit,
    total: Number(count?.total || 0),
    latest_model: latestModel ? { model_id: latestModel.id, created_at: latestModel.created_at, cutoff: latestModel.cutoff } : null,
    rows: rows.results.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        home_margin: asNumber(item.home_margin),
        total: asNumber(item.total),
        home_win_probability: asNumber(item.home_win_probability),
      };
    }),
  });
});
