import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
type SourceReceipt = {
  dataset: string;
  season: number;
  url: string;
  fetched_at: string;
  sha256: string;
};
const metrics = [
  "points",
  "ppg",
  "rpg",
  "orpg",
  "drpg",
  "apg",
  "spg",
  "bpg",
  "fpg",
  "topg",
  "minutes",
  "ts",
  "efg",
  "three_pct",
  "ft_pct",
  "per40",
  "stocks40",
  "ast_to",
  "tov_rate",
  "three_rate",
  "orb40",
  "drb40",
  "reb40",
] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  fromSeason: z.coerce.number().int().min(2010).max(2026).default(2010),
  toSeason: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("points"),
  minGames: z.coerce.number().int().min(1).max(500).default(20),
  minMinutes: z.coerce.number().int().min(0).max(3000).default(200),
  minDenominator: z.coerce.number().int().min(0).max(10000).default(0),
  q: z.string().trim().max(120).optional(),
  classYear: z.string().trim().regex(/^[A-Za-z0-9. -]{0,20}$/).optional(),
  position: z.string().trim().regex(/^[A-Za-z0-9 -]{0,20}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaCareers = new Hono<{ Bindings: Bindings }>();

const metricExpression = (metric: Metric) => ({
  points: "points",
  ppg: "points / games",
  rpg: "rebounds / games",
  orpg: "offensive_rebounds / games",
  drpg: "defensive_rebounds / games",
  apg: "assists / games",
  spg: "steals / games",
  bpg: "blocks / games",
  fpg: "fouls / games",
  topg: "turnovers / games",
  minutes: "minutes",
  ts: "CASE WHEN (fga + 0.475 * fta) > 0 THEN 100.0 * points / (2 * (fga + 0.475 * fta)) ELSE NULL END",
  efg: "CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END",
  three_pct: "CASE WHEN tpa > 0 THEN 100.0 * tpm / tpa ELSE NULL END",
  ft_pct: "CASE WHEN fta > 0 THEN 100.0 * ftm / fta ELSE NULL END",
  per40: "CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END",
  stocks40: "CASE WHEN minutes > 0 THEN 40.0 * (steals + blocks) / minutes ELSE NULL END",
  ast_to: "CASE WHEN turnovers > 0 THEN assists / turnovers ELSE NULL END",
  tov_rate: "CASE WHEN possessions > 0 THEN 100.0 * turnovers / possessions ELSE NULL END",
  three_rate: "CASE WHEN fga > 0 THEN 100.0 * tpa / fga ELSE NULL END",
  orb40: "CASE WHEN minutes > 0 THEN 40.0 * offensive_rebounds / minutes ELSE NULL END",
  drb40: "CASE WHEN minutes > 0 THEN 40.0 * defensive_rebounds / minutes ELSE NULL END",
  reb40: "CASE WHEN minutes > 0 THEN 40.0 * rebounds / minutes ELSE NULL END",
}[metric]);

// Keep thin percentage and ratio samples out of the board without applying a
// made-up universal threshold to unrelated counting metrics.
const metricDenominators: Partial<Record<Metric, string>> = {
  ts: "fga",
  efg: "fga",
  three_pct: "tpa",
  ft_pct: "fta",
  ast_to: "turnovers",
  tov_rate: "possessions",
};
const metricDenominator = (metric: Metric): string | null => metricDenominators[metric] || null;

// The season table stores source totals as a JSON object. Preserve a missing
// field as NULL so a sparse source row cannot become a false zero on a rate
// board or in an export.
const sourceNumber = (path: string) => `CASE WHEN json_extract(stats_json,'$.${path}') IS NOT NULL THEN CAST(json_extract(stats_json,'$.${path}') AS REAL) ELSE NULL END`;

const parseReceipt = (dataset: string, season: number, value: string): SourceReceipt | null => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return typeof parsed.url === "string" && typeof parsed.fetched_at === "string" && typeof parsed.sha256 === "string"
      ? { dataset, season, url: parsed.url, fetched_at: parsed.fetched_at, sha256: parsed.sha256 }
      : null;
  } catch {
    return null;
  }
};

ncaaCareers.get("/", zValidator("query", querySchema), async (c) => {
  const { fromSeason, toSeason, metric, minGames, minMinutes, minDenominator, q, classYear, position, page, meta } = c.req.valid("query");
  if (fromSeason > toSeason) return c.json({ error: "fromSeason must be no later than toSeason" }, 400);
  if (meta === "1") {
    const db = researchDb(c.env);
    const [seasons, classes, positions] = await Promise.all([
      db.prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC").all<{ season: number }>(),
      db.prepare("SELECT DISTINCT json_extract(profile_json,'$.class') AS value FROM bb_ncaa_rosters WHERE value IS NOT NULL AND value != '' ORDER BY value").all<{ value: string }>(),
      db.prepare("SELECT DISTINCT json_extract(profile_json,'$.position') AS value FROM bb_ncaa_rosters WHERE value IS NOT NULL AND value != '' ORDER BY value").all<{ value: string }>(),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => row.season),
      metrics,
      classes: classes.results.map((row) => String(row.value)),
      positions: positions.results.map((row) => String(row.value)),
    });
  }
  const clauses = ["season BETWEEN ? AND ?"];
  const binds: Array<string | number> = [fromSeason, toSeason];
  if (q) {
    clauses.push("(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search);
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
  const aggregate = `
    SELECT season, player_id, team_id, player_name, team_name,
      (SELECT MAX(json_extract(r.profile_json,'$.position')) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS position,
      (SELECT MAX(json_extract(r.profile_json,'$.class')) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS class_year,
      games,
      ${sourceNumber("mins")} AS minutes,
      ${sourceNumber("pts")} AS points,
      CASE WHEN json_extract(stats_json,'$.orb') IS NOT NULL AND json_extract(stats_json,'$.drb') IS NOT NULL THEN CAST(json_extract(stats_json,'$.orb') AS REAL) + CAST(json_extract(stats_json,'$.drb') AS REAL) ELSE NULL END AS rebounds,
      ${sourceNumber("orb")} AS offensive_rebounds,
      ${sourceNumber("drb")} AS defensive_rebounds,
      ${sourceNumber("ast")} AS assists,
      ${sourceNumber("tov")} AS turnovers,
      ${sourceNumber("o_poss")} AS possessions,
      ${sourceNumber("stl")} AS steals,
      ${sourceNumber("blk")} AS blocks,
      ${sourceNumber("pf")} AS fouls,
      ${sourceNumber("fga")} AS fga,
      ${sourceNumber("fgm")} AS fgm,
      ${sourceNumber("tpa")} AS tpa,
      ${sourceNumber("tpm")} AS tpm,
      ${sourceNumber("fta")} AS fta,
      ${sourceNumber("ftm")} AS ftm
    FROM bb_ncaa_player_season s WHERE ${where}`;
  const value = metricExpression(metric);
  const denominator = metricDenominator(metric);
  const effectiveMinDenominator = denominator ? minDenominator : 0;
  const denominatorClause = denominator && effectiveMinDenominator > 0 ? ` AND ${denominator} >= ?` : "";
  const qualification = `games >= ? AND minutes >= ? AND (${value}) IS NOT NULL${denominatorClause}`;
  const qualificationBinds = denominatorClause ? [minGames, minMinutes, effectiveMinDenominator] : [minGames, minMinutes];
  const count = await researchDb(c.env).prepare(`SELECT count(*) AS total FROM (${aggregate}) historical WHERE ${qualification}`).bind(...binds, ...qualificationBinds).first<{ total: number }>();
  const rows = await researchDb(c.env).prepare(`WITH historical AS (${aggregate}), ranked AS (
      SELECT historical.*, ${value} AS value FROM historical WHERE ${qualification}
    ) SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
    ORDER BY value DESC, player_name ASC, player_id ASC LIMIT 50 OFFSET ?`).bind(...binds, ...qualificationBinds, page * 50).all();
  const receipts = await researchDb(c.env).prepare(
    "SELECT dataset,season,receipt_json FROM bb_sources WHERE dataset IN ('ncaa_player_box','ncaa_team_rosters') AND season BETWEEN ? AND ? ORDER BY season DESC,dataset",
  ).bind(fromSeason, toSeason).all<{ dataset: string; season: number; receipt_json: string }>();
  const sourceReceipts = receipts.results
    .map((row) => parseReceipt(row.dataset, row.season, row.receipt_json))
    .filter((receipt): receipt is SourceReceipt => receipt !== null);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ from_season: fromSeason, to_season: toSeason, metric, min_games: minGames, min_minutes: minMinutes, min_denominator: effectiveMinDenominator, denominator_field: denominator, page, page_size: 50, total: Number(count?.total || 0), source_receipts: sourceReceipts, rows: rows.results });
});
