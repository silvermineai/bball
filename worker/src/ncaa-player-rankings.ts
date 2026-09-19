import { researchDb } from "./research-db";
import { Context, Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["ppg", "rpg", "orpg", "drpg", "apg", "spg", "bpg", "fpg", "mpg", "topg", "ts", "efg", "per40", "ast_to", "stocks40", "tov_rate", "three_rate", "three_pct", "ft_pct", "rim_pct", "mid_pct", "ft_rate", "ast_rate", "points_poss", "orb40", "drb40", "reb40", "poss_share", "rim_rate", "transition_share", "unassisted_share", "rapm_net", "orapm", "drapm", "balanced_index", "impact_index"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("ppg"),
  minGames: z.coerce.number().int().min(1).max(40).default(5),
  minMinutes: z.coerce.number().int().min(0).max(3000).default(200),
  minVolume: z.coerce.number().int().min(0).max(10000).default(0),
  q: z.string().trim().max(120).optional(),
  classYear: z.string().trim().regex(/^[A-Za-z0-9. -]{0,20}$/).optional(),
  position: z.string().trim().regex(/^[A-Za-z0-9 -]{0,20}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaPlayerRankings = new Hono<{ Bindings: Bindings }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;
const PUBLISHED_RANKINGS_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NCAA player rankings database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

type PublishedIndividualPlayer = {
  player_id?: unknown;
  team_ncaa_id?: unknown;
  division?: unknown;
  name?: unknown;
  team_name?: unknown;
  class_year?: unknown;
  position?: unknown;
  games?: unknown;
  ppg?: unknown;
  rpg?: unknown;
  apg?: unknown;
  spg?: unknown;
  bpg?: unknown;
  fg_pct?: unknown;
  three_pct?: unknown;
  ft_pct?: unknown;
  mpg?: unknown;
  ast_to?: unknown;
  pf?: unknown;
  tov?: unknown;
  orb?: unknown;
  drb?: unknown;
  pts?: unknown;
  fga?: unknown;
  fgm?: unknown;
  tpa?: unknown;
  tpm?: unknown;
  fta?: unknown;
  ftm?: unknown;
  o_poss?: unknown;
  mins?: unknown;
  [key: string]: unknown;
};

type PublishedIndividualCatalog = {
  season?: unknown;
  generated_at?: unknown;
  players?: unknown;
};

const finite = (value: unknown): number | null => {
  // JSON null and empty cells mean that the publisher did not retain a
  // value. Number(null) and Number("") both equal zero, so coercing before
  // checking availability would invent a recorded zero in the fallback
  // leaderboard.
  if (value == null || typeof value === "boolean" || (typeof value === "string" && value.trim() === "")) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const publishedMinutes = (player: PublishedIndividualPlayer): number | null => {
  const minutes = finite(player.mins);
  if (minutes != null) return minutes;
  const games = finite(player.games);
  const mpg = finite(player.mpg);
  return games != null && games > 0 && mpg != null ? games * mpg : null;
};

const publishedSupportedMetrics = new Set<Metric>([
  "ppg", "rpg", "orpg", "drpg", "apg", "spg", "bpg", "fpg", "mpg", "topg",
  "ts", "efg", "per40", "ast_to", "stocks40", "three_pct", "ft_pct", "ft_rate",
  "orb40", "drb40", "reb40", "points_poss", "ast_rate", "tov_rate", "three_rate",
]);

const playerMetric = (player: PublishedIndividualPlayer, metric: Metric): number | null => {
  const games = finite(player.games) || 0;
  const ppg = finite(player.ppg);
  const minutes = publishedMinutes(player);
  const points = finite(player.pts) ?? (ppg != null && games > 0 ? ppg * games : null);
  const fga = finite(player.fga);
  const fta = finite(player.fta);
  const fgm = finite(player.fgm);
  const tpa = finite(player.tpa);
  const tpm = finite(player.tpm);
  const turnovers = finite(player.tov);
  const possessions = finite(player.o_poss);
  const orb = finite(player.orb);
  const drb = finite(player.drb);
  const direct = (key: string) => finite(player[key]);
  switch (metric) {
    case "ppg": return finite(player.ppg);
    case "rpg": return finite(player.rpg);
    case "orpg": return games > 0 && orb != null ? orb / games : null;
    case "drpg": return games > 0 && drb != null ? drb / games : null;
    case "apg": return finite(player.apg);
    case "spg": return finite(player.spg);
    case "bpg": return finite(player.bpg);
    case "fpg": return games > 0 && finite(player.pf) != null ? (finite(player.pf) as number) / games : null;
    case "mpg": return finite(player.mpg) ?? (games > 0 && minutes != null ? minutes / games : null);
    case "topg": return games > 0 && turnovers != null ? turnovers / games : null;
    case "ts": return fga != null && fta != null && points != null && (fga + 0.475 * fta) > 0 ? 100 * points / (2 * (fga + 0.475 * fta)) : null;
    case "efg": return fga != null && fga > 0 && fgm != null && tpm != null ? 100 * (fgm + 0.5 * tpm) / fga : null;
    case "per40": return minutes != null && minutes > 0 && points != null ? 40 * points / minutes : null;
    case "ast_to": return turnovers != null && turnovers > 0 && finite(player.ast) != null ? (finite(player.ast) as number) / turnovers : null;
    case "stocks40": return minutes != null && minutes > 0 && finite(player.stl) != null && finite(player.blk) != null ? 40 * ((finite(player.stl) as number) + (finite(player.blk) as number)) / minutes : null;
    case "tov_rate": return possessions != null && possessions > 0 && turnovers != null ? 100 * turnovers / possessions : null;
    case "three_rate": return fga != null && fga > 0 && tpa != null ? 100 * tpa / fga : null;
    case "three_pct": return finite(player.three_pct) ?? (tpa != null && tpa > 0 && tpm != null ? 100 * tpm / tpa : null);
    case "ft_pct": return finite(player.ft_pct) ?? (fta != null && fta > 0 && finite(player.ftm) != null ? 100 * (finite(player.ftm) as number) / fta : null);
    case "ft_rate": return fga != null && fga > 0 && fta != null ? 100 * fta / fga : null;
    case "orb40": return minutes != null && minutes > 0 && orb != null ? 40 * orb / minutes : null;
    case "drb40": return minutes != null && minutes > 0 && drb != null ? 40 * drb / minutes : null;
    case "reb40": return minutes != null && minutes > 0 && finite(player.reb) != null ? 40 * (finite(player.reb) as number) / minutes : null;
    case "points_poss": return possessions != null && possessions > 0 && points != null ? points / possessions : null;
    case "ast_rate": return possessions != null && possessions > 0 && finite(player.ast) != null ? 100 * (finite(player.ast) as number) / possessions : null;
    case "poss_share": return null;
    case "rim_pct":
    case "mid_pct":
    case "rim_rate":
    case "transition_share":
    case "unassisted_share":
    case "rapm_net":
    case "orapm":
    case "drapm":
    case "balanced_index":
    case "impact_index":
      return direct(metric);
  }
};

async function publishedRankingsFallback(
  c: Context<{ Bindings: Bindings }>,
  args: { season: number; metric: Metric; minGames: number; minMinutes: number; minVolume: number; q?: string; classYear?: string; position?: string; page: number; meta: string },
): Promise<Response | null> {
  if (!c.env.ASSETS || args.season !== 2026 || (args.meta !== "1" && !publishedSupportedMetrics.has(args.metric))) return null;
  try {
    const asset = await withTimeout(
      c.env.ASSETS.fetch(new Request(new URL("/data/basketball/ncaa-individual.json", c.req.url))),
      PUBLISHED_RANKINGS_TIMEOUT_MS,
    );
    if (!asset.ok) return null;
    const catalog = await asset.json() as PublishedIndividualCatalog;
    const players = Array.isArray(catalog.players)
      ? catalog.players.filter((value): value is PublishedIndividualPlayer => Boolean(value && typeof value === "object"))
      : [];
    if (args.meta === "1") {
      const classes = [...new Set(players.map((player) => typeof player.class_year === "string" ? player.class_year : "").filter(Boolean))].sort();
      const positions = [...new Set(players.map((player) => typeof player.position === "string" ? player.position : "").filter(Boolean))].sort();
      const response = c.json({
        seasons: [2026],
        metrics,
        classes,
        positions,
        sources: [],
        generated_at: typeof catalog.generated_at === "string" ? catalog.generated_at : null,
        source: "published_fallback",
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      return response;
    }
    const search = args.q?.toLowerCase();
    const volume = (player: PublishedIndividualPlayer): number | null | undefined => {
      if (["ts", "efg", "three_rate", "ft_rate"].includes(args.metric)) return finite(player.fga);
      if (args.metric === "three_pct") return finite(player.tpa);
      if (args.metric === "ft_pct") return finite(player.fta);
      if (args.metric === "ast_to") return finite(player.tov);
      if (["tov_rate", "ast_rate", "points_poss"].includes(args.metric)) return finite(player.o_poss);
      // The D1 query ignores minVolume for counting and per-game metrics.
      // Preserve that behavior in the published fallback: a rate cutoff can
      // remain in a shared URL when the reader switches to PPG, APG, etc.
      return undefined;
    };
    const rows = players
      .filter((player) => finite(player.division) === 1)
      .filter((player) => {
        const games = finite(player.games) || 0;
        const minutes = publishedMinutes(player);
        return games >= args.minGames && minutes != null && minutes >= args.minMinutes;
      })
      .filter((player) => !search || [player.name, player.team_name, player.player_id].some((value) => String(value || "").toLowerCase().includes(search)))
      .filter((player) => !args.classYear || player.class_year === args.classYear)
      .filter((player) => !args.position || player.position === args.position)
      .filter((player) => {
        const sample = volume(player);
        return sample === undefined || (sample != null && sample >= args.minVolume);
      })
      .map((player) => ({ player, value: playerMetric(player, args.metric) }))
      .filter((row): row is { player: PublishedIndividualPlayer; value: number } => row.value != null)
      .sort((a, b) => (args.metric === "topg" || args.metric === "tov_rate" ? a.value - b.value : b.value - a.value) || String(a.player.name || "").localeCompare(String(b.player.name || "")));
    const start = args.page * 50;
    const response = c.json({
      season: 2026,
      metric: args.metric,
      direction: args.metric === "topg" || args.metric === "tov_rate" ? "asc" : "desc",
      min_games: args.minGames,
      min_minutes: args.minMinutes,
      min_volume: args.minVolume,
      page: args.page,
      page_size: 50,
      total: rows.length,
      source: "published_fallback",
      rows: rows.slice(start, start + 50).map(({ player, value }, index) => ({
        season: 2026,
        player_id: String(player.player_id || ""),
        team_id: String(player.team_ncaa_id || ""),
        player_name: typeof player.name === "string" ? player.name : null,
        team_name: typeof player.team_name === "string" ? player.team_name : null,
        position: typeof player.position === "string" ? player.position : null,
        class_year: typeof player.class_year === "string" ? player.class_year : null,
        games: finite(player.games) || 0,
        minutes: publishedMinutes(player),
        points: finite(player.pts),
        rebounds: finite(player.reb),
        offensive_rebounds: finite(player.orb),
        defensive_rebounds: finite(player.drb),
        assists: finite(player.ast),
        steals: finite(player.stl),
        blocks: finite(player.blk),
        fouls: finite(player.pf),
        turnovers: finite(player.tov),
        fga: finite(player.fga),
        fgm: finite(player.fgm),
        tpa: finite(player.tpa),
        tpm: finite(player.tpm),
        fta: finite(player.fta),
        ftm: finite(player.ftm),
        value,
        rank: start + index + 1,
      })),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    return response;
  } catch {
    return null;
  }
}

// Season aggregates retain only source-observed numeric fields. A missing
// field must stay unavailable; coercing it to zero would create a false
// ranking value for sparse NCAA rows.
const sourceSum = (path: string) => `CASE WHEN COUNT(json_extract(s.stats_json,'$.${path}')) > 0 THEN SUM(CAST(json_extract(s.stats_json,'$.${path}') AS REAL)) ELSE NULL END`;
const sourceSumAll = (paths: string[]) => `CASE WHEN ${paths.map((path) => `COUNT(json_extract(s.stats_json,'$.${path}')) = COUNT(*)`).join(" AND ")} THEN SUM(${paths.map((path) => `CAST(json_extract(s.stats_json,'$.${path}') AS REAL)`).join(" + ")}) ELSE NULL END`;

const aggregate = (where: string) => `
  SELECT s.season, s.player_id, s.team_id,
    MAX(s.player_name) AS player_name, MAX(s.team_name) AS team_name,
    (SELECT MAX(json_extract(r.profile_json,'$.position')) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS position,
    (SELECT MAX(json_extract(r.profile_json,'$.class')) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS class_year,
    (SELECT MAX(CAST(json_extract(r.profile_json,'$.height') AS TEXT)) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS roster_height,
    (SELECT MAX(CAST(json_extract(r.profile_json,'$.hometown') AS TEXT)) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS hometown,
    (SELECT MAX(CAST(json_extract(r.profile_json,'$.high_school') AS TEXT)) FROM bb_ncaa_rosters r WHERE r.season=s.season AND r.player_id=s.player_id AND r.team_id=s.team_id) AS high_school,
    SUM(s.games) AS games,
    ${sourceSum("mins")} AS minutes,
    ${sourceSum("pts")} AS points,
    ${sourceSumAll(["orb", "drb"])} AS rebounds,
    ${sourceSum("orb")} AS offensive_rebounds,
    ${sourceSum("drb")} AS defensive_rebounds,
    ${sourceSum("ast")} AS assists,
    ${sourceSum("tov")} AS turnovers,
    ${sourceSum("o_poss")} AS possessions,
    ${sourceSum("stl")} AS steals,
    ${sourceSum("blk")} AS blocks,
    ${sourceSum("pf")} AS fouls,
    ${sourceSum("fga")} AS fga,
    ${sourceSum("fgm")} AS fgm,
    ${sourceSum("tpa")} AS tpa,
    ${sourceSum("tpm")} AS tpm,
    ${sourceSum("fta")} AS fta,
    ${sourceSum("ftm")} AS ftm,
    ${sourceSum("rima")} AS rim_attempts,
    ${sourceSum("rimm")} AS rim_makes,
    ${sourceSum("mida")} AS mid_attempts,
    ${sourceSum("midm")} AS mid_makes,
    ${sourceSum("pts_trans")} AS transition_points,
    ${sourceSum("pts_unast")} AS unassisted_points,
    CASE WHEN SUM(CASE WHEN json_extract(s.stats_json,'$.o_poss') IS NOT NULL THEN 1 ELSE 0 END) OVER (PARTITION BY s.season, s.team_id) = COUNT(*) OVER (PARTITION BY s.season, s.team_id)
      THEN SUM(SUM(CAST(json_extract(s.stats_json,'$.o_poss') AS REAL))) OVER (PARTITION BY s.season, s.team_id)
      ELSE NULL END AS team_possessions,
    (SELECT CAST(json_extract(i.data_json,'$.rapm_net') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS rapm_net,
    (SELECT CAST(json_extract(i.data_json,'$.orapm') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS orapm,
    (SELECT CAST(json_extract(i.data_json,'$.drapm') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS drapm,
    (SELECT CAST(json_extract(i.data_json,'$.off_poss') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS off_poss,
    (SELECT CAST(json_extract(i.data_json,'$.def_poss') AS REAL) FROM bb_impact i WHERE i.season=s.season AND i.ncaa_player_id=s.player_id LIMIT 1) AS def_poss
  FROM bb_ncaa_player_season s WHERE ${where}
  GROUP BY s.season, s.player_id, s.team_id`;

const metricExpression = (metric: Exclude<Metric, "balanced_index" | "impact_index">) => ({
  ppg: "points / games",
  rpg: "rebounds / games",
  orpg: "offensive_rebounds / games",
  drpg: "defensive_rebounds / games",
  apg: "assists / games",
  spg: "steals / games",
  bpg: "blocks / games",
  fpg: "fouls / games",
  mpg: "minutes / games",
  topg: "turnovers / games",
  ts: "CASE WHEN (fga + 0.475 * fta) > 0 THEN 100.0 * points / (2 * (fga + 0.475 * fta)) ELSE NULL END",
  efg: "CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END",
  per40: "CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END",
  ast_to: "CASE WHEN turnovers > 0 THEN assists / turnovers ELSE NULL END",
  stocks40: "CASE WHEN minutes > 0 THEN 40.0 * (steals + blocks) / minutes ELSE NULL END",
  tov_rate: "CASE WHEN possessions > 0 THEN 100.0 * turnovers / possessions ELSE NULL END",
  three_rate: "CASE WHEN fga > 0 THEN 100.0 * tpa / fga ELSE NULL END",
  three_pct: "CASE WHEN tpa > 0 THEN 100.0 * tpm / tpa ELSE NULL END",
  ft_pct: "CASE WHEN fta > 0 THEN 100.0 * ftm / fta ELSE NULL END",
  rim_pct: "CASE WHEN rim_attempts > 0 THEN 100.0 * rim_makes / rim_attempts ELSE NULL END",
  mid_pct: "CASE WHEN mid_attempts > 0 THEN 100.0 * mid_makes / mid_attempts ELSE NULL END",
  ft_rate: "CASE WHEN fga > 0 THEN 100.0 * fta / fga ELSE NULL END",
  ast_rate: "CASE WHEN possessions > 0 THEN 100.0 * assists / possessions ELSE NULL END",
  points_poss: "CASE WHEN possessions > 0 THEN points / possessions ELSE NULL END",
  orb40: "CASE WHEN minutes > 0 THEN 40.0 * offensive_rebounds / minutes ELSE NULL END",
  drb40: "CASE WHEN minutes > 0 THEN 40.0 * defensive_rebounds / minutes ELSE NULL END",
  reb40: "CASE WHEN minutes > 0 THEN 40.0 * rebounds / minutes ELSE NULL END",
  poss_share: "CASE WHEN team_possessions > 0 THEN 100.0 * possessions / team_possessions ELSE NULL END",
  rim_rate: "CASE WHEN fga > 0 THEN 100.0 * rim_attempts / fga ELSE NULL END",
  transition_share: "CASE WHEN points > 0 THEN 100.0 * transition_points / points ELSE NULL END",
  unassisted_share: "CASE WHEN points > 0 THEN 100.0 * unassisted_points / points ELSE NULL END",
  rapm_net: "rapm_net",
  orapm: "orapm",
  drapm: "drapm",
}[metric]);

const impactMetric = (metric: Metric) => metric === "rapm_net" || metric === "orapm" || metric === "drapm";
// Turnover volume and turnover rate are the two player measures where a
// smaller value is the favorable direction. Keep the API order aligned with
// the "Ball security" label used by the dashboard and ranking desk; all other
// ranking metrics remain high-first.
const rankingDirection = (metric: Metric): "asc" | "desc" => metric === "tov_rate" || metric === "topg" ? "asc" : "desc";
const impactQualification = (metric: Metric) => impactMetric(metric) ? "off_poss >= 500 AND def_poss >= 500" : "1=1";
const volumeColumn = (metric: Metric) => {
  if (metric === "ts" || metric === "efg" || metric === "three_rate" || metric === "ft_rate" || metric === "rim_rate") return "fga";
  if (metric === "three_pct") return "tpa";
  if (metric === "ft_pct") return "fta";
  if (metric === "rim_pct") return "rim_attempts";
  if (metric === "mid_pct") return "mid_attempts";
  if (metric === "ast_to") return "turnovers";
  if (metric === "tov_rate" || metric === "ast_rate" || metric === "points_poss" || metric === "poss_share") return "possessions";
  if (metric === "transition_share" || metric === "unassisted_share") return "points";
  return null;
};

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
      NULLIF(fga + 0.475 * fta, 0) AS ts_denominator,
      CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END AS efg_value,
      NULLIF(fga, 0) AS efg_denominator,
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

// Require exact-ID lineup impact and a sustained scoring rate, standardize
// both within the filtered cohort, and average the two z-scores. This is a
// descriptive shortlist; it never enters forecasts.
const impactQueries = (where: string, minGames: number, minMinutes: number) => {
  const derived = `
    SELECT a.*,
      CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END AS per40_value
    FROM aggregate a
    WHERE games >= ? AND minutes >= ?`;
  const stats = `
    SELECT d.*,
      AVG(rapm_net) OVER () AS rapm_mean,
      sqrt(max(0.0, AVG(rapm_net * rapm_net) OVER () - AVG(rapm_net) OVER () * AVG(rapm_net) OVER ())) AS rapm_sd,
      AVG(per40_value) OVER () AS per40_mean,
      sqrt(max(0.0, AVG(per40_value * per40_value) OVER () - AVG(per40_value) OVER () * AVG(per40_value) OVER ())) AS per40_sd
    FROM derived d`;
  const scored = `
    SELECT s.*,
      ((rapm_net - rapm_mean) / NULLIF(rapm_sd, 0.0) +
       (per40_value - per40_mean) / NULLIF(per40_sd, 0.0)) / 2.0 AS value
    FROM stats s
    WHERE rapm_net IS NOT NULL AND per40_value IS NOT NULL AND off_poss >= 500 AND def_poss >= 500`;
  const prefix = `WITH aggregate AS (${aggregate(where)}), derived AS (${derived}), stats AS (${stats}), scored AS (${scored})`;
  return {
    count: `${prefix} SELECT count(*) AS total FROM scored WHERE value IS NOT NULL`,
    rows: `${prefix} SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM scored WHERE value IS NOT NULL ORDER BY value DESC, player_name ASC, player_id ASC LIMIT 50 OFFSET ?`,
    binds: [minGames, minMinutes],
  };
};

ncaaPlayerRankings.get("/", zValidator("query", querySchema), async (c) => {
  const { season, metric, minGames, minMinutes, minVolume, q, classYear, position, page, meta } = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the rankings board fail.
    }
  }
  if (meta === "1") {
    try {
      const [seasons, classes, positions, sources] = await withTimeout(researchDb(c.env).batch([
        researchDb(c.env).prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC"),
        researchDb(c.env).prepare("SELECT DISTINCT json_extract(profile_json,'$.class') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
        researchDb(c.env).prepare("SELECT DISTINCT json_extract(profile_json,'$.position') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
        researchDb(c.env).prepare("SELECT dataset, json_extract(receipt_json,'$.url') AS url, json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE season=? AND dataset IN ('ncaa_player_box','ncaa_rapm','ncaa_team_rosters') ORDER BY dataset").bind(season),
      ]), DB_TIMEOUT_MS);
      const response = c.json({
        seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
        metrics,
        classes: classes.results.map((row) => String((row as { value: string }).value)),
        positions: positions.results.map((row) => String((row as { value: string }).value)),
        sources: (sources.results as Array<{ dataset?: unknown; url?: unknown; fetched_at?: unknown; sha256?: unknown }>).map((row) => ({
          dataset: String(row.dataset || ""),
          url: typeof row.url === "string" ? row.url : null,
          fetched_at: typeof row.fetched_at === "string" ? row.fetched_at : null,
          sha256: typeof row.sha256 === "string" ? row.sha256 : null,
        })),
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      const fallback = await publishedRankingsFallback(c, { season, metric, minGames, minMinutes, minVolume, q, classYear, position, page, meta });
      if (fallback) return fallback;
      return c.json({ error: "The NCAA player rankings catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
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
  const expression = metric === "balanced_index" || metric === "impact_index" ? null : metricExpression(metric);
  const direction = rankingDirection(metric);
  const rankOrder = direction === "asc" ? "ASC" : "DESC";
  const qualification = impactQualification(metric);
  const volume = volumeColumn(metric);
  const volumeQualification = volume ? `${volume} >= ?` : "1=1";
  const volumeBinds = volume ? [minVolume] : [];
  try {
  const count: { total: number } | null = metric === "balanced_index"
    ? await withTimeout((() => {
      const query = balancedQueries(where, minGames, minMinutes);
      return researchDb(c.env).prepare(query.count).bind(...binds, ...query.binds).first<{ total: number }>();
    })(), DB_TIMEOUT_MS)
    : metric === "impact_index"
      ? await withTimeout((() => {
        const query = impactQueries(where, minGames, minMinutes);
        return researchDb(c.env).prepare(query.count).bind(...binds, ...query.binds).first<{ total: number }>();
      })(), DB_TIMEOUT_MS)
    : await withTimeout(researchDb(c.env).prepare(
      `SELECT count(*) AS total FROM (${aggregate(where)}) a WHERE a.games >= ? AND a.minutes >= ? AND ${qualification} AND ${volumeQualification} AND (${expression}) IS NOT NULL`,
    ).bind(...binds, minGames, minMinutes, ...volumeBinds).first<{ total: number }>(), DB_TIMEOUT_MS);
  const rows = metric === "balanced_index"
    ? await withTimeout((() => {
      const query = balancedQueries(where, minGames, minMinutes);
      return researchDb(c.env).prepare(query.rows).bind(...binds, ...query.binds, page * 50).all();
    })(), DB_TIMEOUT_MS)
    : metric === "impact_index"
      ? await withTimeout((() => {
        const query = impactQueries(where, minGames, minMinutes);
        return researchDb(c.env).prepare(query.rows).bind(...binds, ...query.binds, page * 50).all();
      })(), DB_TIMEOUT_MS)
    : await withTimeout(researchDb(c.env).prepare(
      `WITH aggregate AS (${aggregate(where)}), ranked AS (
        SELECT aggregate.*, ${expression} AS value
        FROM aggregate WHERE games >= ? AND minutes >= ? AND ${qualification} AND ${volumeQualification}
      )
      SELECT *, RANK() OVER (ORDER BY value ${rankOrder}) AS rank FROM ranked
      WHERE value IS NOT NULL ORDER BY value ${rankOrder}, player_name ASC, player_id ASC
      LIMIT 50 OFFSET ?`,
    ).bind(...binds, minGames, minMinutes, ...volumeBinds, page * 50).all(), DB_TIMEOUT_MS);
  const response = c.json({ season, metric, direction, min_games: minGames, min_minutes: minMinutes, min_volume: minVolume, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
  } catch {
    const fallback = await publishedRankingsFallback(c, { season, metric, minGames, minMinutes, minVolume, q, classYear, position, page, meta });
    if (fallback) return fallback;
    return c.json({ error: "The NCAA player rankings are temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
