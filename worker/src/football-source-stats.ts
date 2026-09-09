import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const DATASETS = ["box", "passing", "rushing", "receiving", "defense", "specialists", "team_advanced", "teams", "betting"] as const;
type Dataset = (typeof DATASETS)[number];

const querySchema = z.object({
  dataset: z.enum(["all", ...DATASETS]).default("box"),
  season: z.coerce.number().int().min(2018).max(2035).default(2025),
  q: z.string().trim().max(100).default(""),
  team: z.string().regex(/^\d{1,15}$/).optional(),
  game: z.string().regex(/^\d{1,15}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const footballSourceStats = new Hono<{ Bindings: Env }>();

footballSourceStats.get("/", zValidator("query", querySchema), async (c) => {
  const q = c.req.valid("query");
  if (q.meta === "1") {
    const [seasons, datasets] = await Promise.all([
      c.env.DB.prepare("SELECT DISTINCT season FROM football_stats ORDER BY season DESC").all<{ season: number }>(),
      c.env.DB.prepare("SELECT dataset,count(*) AS rows FROM football_stats GROUP BY dataset ORDER BY dataset").all<{ dataset: Dataset; rows: number }>(),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => row.season),
      datasets: datasets.results,
      dataset_labels: {
        box: "Player box scores",
        passing: "Passing aggregates",
        rushing: "Rushing aggregates",
        receiving: "Receiving aggregates",
        defense: "Defensive events",
        specialists: "Kicking, punting & returns",
        team_advanced: "Advanced team rates",
        teams: "Team directory",
        betting: "Historical market archive",
      } satisfies Record<Dataset, string>,
    });
  }
  const conditions = ["s.season=?"];
  const binds: Array<string | number> = [q.season];
  if (q.dataset !== "all") {
    conditions.push("s.dataset=?");
    binds.push(q.dataset);
  }
  if (q.team) {
    conditions.push("s.team_id=?");
    binds.push(q.team);
  }
  if (q.game) {
    conditions.push("s.game_id=?");
    binds.push(q.game);
  }
  if (q.q) {
    // instr keeps searches literal: '%' and '_' are ordinary characters.
    conditions.push("instr(lower(s.stats_json),lower(?))>0");
    binds.push(q.q);
  }
  const where = conditions.join(" AND ");
  const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM football_stats s WHERE ${where}`)
    .bind(...binds)
    .first<{ total: number }>();
  const rows = await c.env.DB.prepare(`SELECT s.dataset,s.season,s.record_key,s.athlete_id,s.team_id,s.game_id,s.category,s.stats_json,
      g.kickoff,g.home_name,g.away_name,g.home_score,g.away_score
      FROM football_stats s LEFT JOIN football_games g ON g.id=s.game_id
      WHERE ${where}
      ORDER BY g.kickoff IS NULL,g.kickoff DESC,s.dataset ASC,s.record_key ASC
      LIMIT 40 OFFSET ?`)
    .bind(...binds, q.page * 40)
    .all<{
      dataset: Dataset;
      season: number;
      record_key: string;
      athlete_id: string | null;
      team_id: string | null;
      game_id: string | null;
      category: string | null;
      stats_json: string;
      kickoff: string | null;
      home_name: string | null;
      away_name: string | null;
      home_score: number | null;
      away_score: number | null;
    }>();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    dataset: q.dataset,
    season: q.season,
    page: q.page,
    page_size: 40,
    total: count?.total ?? 0,
    filters: { q: q.q, team: q.team ?? null, game: q.game ?? null },
    rows: rows.results.flatMap(({ stats_json, ...row }) => {
      try {
        return [{
          ...row,
          stats: JSON.parse(stats_json) as Record<string, unknown>,
          game: row.game_id && row.kickoff ? {
            id: row.game_id,
            kickoff: row.kickoff,
            home_name: row.home_name,
            away_name: row.away_name,
            home_score: row.home_score,
            away_score: row.away_score,
          } : null,
        }];
      } catch {
        return [];
      }
    }),
  });
});
