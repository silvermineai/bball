import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2024).max(2035).default(2027),
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

export const basketballForecasts = new Hono<{ Bindings: Bindings }>();

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

basketballForecasts.get("/", zValidator("query", querySchema), async (c) => {
  const { season, status, q, model, page, limit, meta } = c.req.valid("query");

  if (meta === "1") {
    const [seasons, models] = await c.env.DB.batch([
      c.env.DB.prepare(
        "SELECT DISTINCT g.season FROM bb_forecasts f JOIN bb_games g ON g.id=f.game_id ORDER BY g.season DESC",
      ),
      c.env.DB.prepare(
        "SELECT model_id, count(*) AS forecasts, MIN(created_at) AS first_created_at, MAX(created_at) AS last_created_at FROM bb_forecasts GROUP BY model_id ORDER BY last_created_at DESC, model_id",
      ),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      models: models.results,
    });
  }

  const clauses = ["g.season=?"];
  const binds: Array<string | number> = [season];
  if (status === "upcoming") clauses.push("g.completed=0");
  if (status === "completed") clauses.push("g.completed=1");
  if (q) {
    const search = `%${escapeLike(q)}%`;
    clauses.push("(g.home_name LIKE ? ESCAPE '\\' OR g.away_name LIKE ? ESCAPE '\\')");
    binds.push(search, search);
  }
  if (model === "latest") {
    clauses.push("f.model_id=(SELECT id FROM bb_models ORDER BY created_at DESC,id DESC LIMIT 1)");
  } else if (model !== "all") {
    clauses.push("f.model_id=?");
    binds.push(model);
  }
  const where = clauses.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total FROM bb_forecasts f JOIN bb_games g ON g.id=f.game_id WHERE ${where}`,
  ).bind(...binds).first<{ total: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT f.game_id,f.model_id,f.created_at,f.prediction_json,
            g.season,g.starts_at,g.home_id,g.away_id,g.home_name,g.away_name,
            g.home_score,g.away_score,g.completed,g.neutral,g.time_tbd,g.venue,g.broadcast
       FROM bb_forecasts f JOIN bb_games g ON g.id=f.game_id
      WHERE ${where}
      ORDER BY g.starts_at ASC,f.created_at ASC,f.model_id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, limit, page * limit).all<{
    game_id: string;
    model_id: string;
    created_at: string;
    prediction_json: string;
    season: number;
    starts_at: string;
    home_id: string;
    away_id: string;
    home_name: string | null;
    away_name: string | null;
    home_score: number | null;
    away_score: number | null;
    completed: number;
    neutral: number;
    time_tbd: number;
    venue: string | null;
    broadcast: string | null;
  }>();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    status,
    model,
    query: q || null,
    page,
    page_size: limit,
    total: Number(count?.total || 0),
    rows: rows.results.map(({ prediction_json, ...row }) => {
      let prediction: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(prediction_json) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          prediction = parsed as Record<string, unknown>;
        }
      } catch {
        // A malformed stored payload is withheld instead of failing the whole page.
      }
      return { ...row, prediction };
    }),
  });
});
