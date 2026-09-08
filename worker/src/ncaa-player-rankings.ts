import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["ppg", "rpg", "apg", "spg", "bpg", "ts", "efg", "per40", "rapm_net", "balanced_index"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("ppg"),
  minGames: z.coerce.number().int().min(1).max(40).default(5),
  minMinutes: z.coerce.number().int().min(0).max(3000).default(200),
  q: z.string().trim().max(120).optional(),
  classYear: z.string().trim().regex(/^[A-Za-z0-9. -]{0,20}$/).optional(),
  position: z.string().trim().regex(/^[A-Za-z0-9 -]{0,20}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaPlayerRankings = new Hono<{ Bindings: Bindings }>();

const aggregate = (where: string) => `
  SELECT s.season, s.player_id, s.team_id,
    MAX(s.player_name) AS player_name, MAX(s.team_name) AS team_name,
    (SELECT MAX(json_extract(r.profile_json,'$.position')) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS position,
    (SELECT MAX(json_extract(r.profile_json,'$.class')) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS class_year,
    SUM(s.games) AS games,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.mins') AS REAL),0)) AS minutes,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.pts') AS REAL),0)) AS points,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.orb') AS REAL),0) + COALESCE(CAST(json_extract(s.stats_json,'$.drb') AS REAL),0)) AS rebounds,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.ast') AS REAL),0)) AS assists,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.stl') AS REAL),0)) AS steals,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.blk') AS REAL),0)) AS blocks,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.fga') AS REAL),0)) AS fga,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.fgm') AS REAL),0)) AS fgm,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.tpa') AS REAL),0)) AS tpa,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.tpm') AS REAL),0)) AS tpm,
    SUM(COALESCE(CAST(json_extract(s.stats_json,'$.fta') AS REAL),0)) AS fta,
    (SELECT CAST(json_extract(i.data_json,'$.rapm_net') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS rapm_net,
    (SELECT CAST(json_extract(i.data_json,'$.orapm') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS orapm,
    (SELECT CAST(json_extract(i.data_json,'$.drapm') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS drapm,
    (SELECT CAST(json_extract(i.data_json,'$.off_poss') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS off_poss,
    (SELECT CAST(json_extract(i.data_json,'$.def_poss') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS def_poss
  FROM bb_ncaa_player_season s WHERE ${where}
  GROUP BY s.season, s.player_id, s.team_id`;

const metricExpression = (metric: Exclude<Metric, "balanced_index">) => ({
  ppg: "points / games",
  rpg: "rebounds / games",
  apg: "assists / games",
  spg: "steals / games",
  bpg: "blocks / games",
  ts: "CASE WHEN (fga + 0.475 * fta) > 0 THEN 100.0 * points / (2 * (fga + 0.475 * fta)) ELSE NULL END",
  efg: "CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END",
  per40: "CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END",
  rapm_net: "rapm_net",
}[metric]);

// A descriptive shortlist for readers who do not want to choose one box-score
// category. Each component is standardized within the filtered cohort, then
// averaged only across available components. Four components are required so
// sparse source rows cannot lead the board. This never enters the forecast.
const balancedQueries = (where: string, minGames: number, minMinutes: number) => {
  const derived = `
    SELECT a.*,
      points / NULLIF(games, 0) AS ppg_value,
      rebounds / NULLIF(games, 0) AS rpg_value,
      assists / NULLIF(games, 0) AS apg_value,
      steals / NULLIF(games, 0) AS spg_value,
      blocks / NULLIF(games, 0) AS bpg_value,
      CASE WHEN (fga + 0.475 * fta) > 0 THEN 100.0 * points / (2 * (fga + 0.475 * fta)) ELSE NULL END AS ts_value,
      CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END AS efg_value,
      CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END AS per40_value
    FROM aggregate a
    WHERE games >= ? AND minutes >= ?`;
  const stats = `
    SELECT d.*,
      (CASE WHEN ppg_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN rpg_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN apg_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN spg_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN bpg_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN ts_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN efg_value IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN per40_value IS NOT NULL THEN 1 ELSE 0 END) AS component_count,
      AVG(ppg_value) OVER () AS ppg_mean,
      sqrt(max(0.0, AVG(ppg_value * ppg_value) OVER () - AVG(ppg_value) OVER () * AVG(ppg_value) OVER ())) AS ppg_sd,
      AVG(rpg_value) OVER () AS rpg_mean,
      sqrt(max(0.0, AVG(rpg_value * rpg_value) OVER () - AVG(rpg_value) OVER () * AVG(rpg_value) OVER ())) AS rpg_sd,
      AVG(apg_value) OVER () AS apg_mean,
      sqrt(max(0.0, AVG(apg_value * apg_value) OVER () - AVG(apg_value) OVER () * AVG(apg_value) OVER ())) AS apg_sd,
      AVG(spg_value) OVER () AS spg_mean,
      sqrt(max(0.0, AVG(spg_value * spg_value) OVER () - AVG(spg_value) OVER () * AVG(spg_value) OVER ())) AS spg_sd,
      AVG(bpg_value) OVER () AS bpg_mean,
      sqrt(max(0.0, AVG(bpg_value * bpg_value) OVER () - AVG(bpg_value) OVER () * AVG(bpg_value) OVER ())) AS bpg_sd,
      AVG(ts_value) OVER () AS ts_mean,
      sqrt(max(0.0, AVG(ts_value * ts_value) OVER () - AVG(ts_value) OVER () * AVG(ts_value) OVER ())) AS ts_sd,
      AVG(efg_value) OVER () AS efg_mean,
      sqrt(max(0.0, AVG(efg_value * efg_value) OVER () - AVG(efg_value) OVER () * AVG(efg_value) OVER ())) AS efg_sd,
      AVG(per40_value) OVER () AS per40_mean,
      sqrt(max(0.0, AVG(per40_value * per40_value) OVER () - AVG(per40_value) OVER () * AVG(per40_value) OVER ())) AS per40_sd
    FROM derived d`;
  const scored = `
    SELECT s.*,
      (
        CASE WHEN ppg_value IS NOT NULL AND ppg_sd > 0 THEN (ppg_value - ppg_mean) / ppg_sd ELSE 0 END +
        CASE WHEN rpg_value IS NOT NULL AND rpg_sd > 0 THEN (rpg_value - rpg_mean) / rpg_sd ELSE 0 END +
        CASE WHEN apg_value IS NOT NULL AND apg_sd > 0 THEN (apg_value - apg_mean) / apg_sd ELSE 0 END +
        CASE WHEN spg_value IS NOT NULL AND spg_sd > 0 THEN (spg_value - spg_mean) / spg_sd ELSE 0 END +
        CASE WHEN bpg_value IS NOT NULL AND bpg_sd > 0 THEN (bpg_value - bpg_mean) / bpg_sd ELSE 0 END +
        CASE WHEN ts_value IS NOT NULL AND ts_sd > 0 THEN (ts_value - ts_mean) / ts_sd ELSE 0 END +
        CASE WHEN efg_value IS NOT NULL AND efg_sd > 0 THEN (efg_value - efg_mean) / efg_sd ELSE 0 END +
        CASE WHEN per40_value IS NOT NULL AND per40_sd > 0 THEN (per40_value - per40_mean) / per40_sd ELSE 0 END
      ) / NULLIF(component_count, 0) AS value
    FROM stats s
    WHERE component_count >= 4`;
  const prefix = `WITH aggregate AS (${aggregate(where)}), derived AS (${derived}), stats AS (${stats}), scored AS (${scored})`;
  return {
    count: `${prefix} SELECT count(*) AS total FROM scored WHERE value IS NOT NULL`,
    rows: `${prefix} SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM scored WHERE value IS NOT NULL ORDER BY value DESC, player_name ASC, player_id ASC LIMIT 50 OFFSET ?`,
    binds: [minGames, minMinutes],
  };
};

ncaaPlayerRankings.get("/", zValidator("query", querySchema), async (c) => {
  const { season, metric, minGames, minMinutes, q, classYear, position, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, classes, positions] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC"),
      c.env.DB.prepare("SELECT DISTINCT json_extract(profile_json,'$.class') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      c.env.DB.prepare("SELECT DISTINCT json_extract(profile_json,'$.position') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      metrics,
      classes: classes.results.map((row) => String((row as { value: string }).value)),
      positions: positions.results.map((row) => String((row as { value: string }).value)),
    });
  }
  const clauses = ["s.season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(s.player_name LIKE ? OR s.team_name LIKE ? OR s.player_id LIKE ? OR s.team_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search);
  }
  if (classYear) {
    clauses.push("EXISTS (SELECT 1 FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id AND json_extract(r.profile_json,'$.class')=?)");
    binds.push(classYear);
  }
  if (position) {
    clauses.push("EXISTS (SELECT 1 FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id AND json_extract(r.profile_json,'$.position')=?)");
    binds.push(position);
  }
  const where = clauses.join(" AND ");
  const expression = metric === "balanced_index" ? null : metricExpression(metric);
  const count: { total: number } | null = metric === "balanced_index"
    ? await (() => {
      const query = balancedQueries(where, minGames, minMinutes);
      return c.env.DB.prepare(query.count).bind(...binds, ...query.binds).first<{ total: number }>();
    })()
    : await c.env.DB.prepare(
      `SELECT count(*) AS total FROM (${aggregate(where)}) a WHERE a.games >= ? AND a.minutes >= ? AND (${expression}) IS NOT NULL`,
    ).bind(...binds, minGames, minMinutes).first<{ total: number }>();
  const rows = metric === "balanced_index"
    ? await (() => {
      const query = balancedQueries(where, minGames, minMinutes);
      return c.env.DB.prepare(query.rows).bind(...binds, ...query.binds, page * 50).all();
    })()
    : await c.env.DB.prepare(
      `WITH aggregate AS (${aggregate(where)}), ranked AS (
        SELECT aggregate.*, ${expression} AS value
        FROM aggregate WHERE games >= ? AND minutes >= ?
      )
      SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
      WHERE value IS NOT NULL ORDER BY value DESC, player_name ASC, player_id ASC
      LIMIT 50 OFFSET ?`,
    ).bind(...binds, minGames, minMinutes, page * 50).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season, metric, min_games: minGames, min_minutes: minMinutes, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
});
