import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2026).max(2026).default(2026),
  q: z.string().trim().max(120).optional(),
  espnId: z.string().trim().regex(/^\d{1,15}$/).optional(),
  provider: z.enum(["all", "fox", "yahoo"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const playerCrosswalk = new Hono<{ Bindings: Bindings }>();

/**
 * Browse the publisher-supplied ESPN/Fox/Yahoo identifier crosswalk. The
 * endpoint keeps the provider namespace explicit and returns the source's
 * match confidence without presenting it as an NCAA identity join.
 */
playerCrosswalk.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, espnId, provider, page, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  if (meta === "1") {
    const [seasons, counts, source] = await db.batch([
      db.prepare("SELECT DISTINCT season FROM bb_player_crosswalk ORDER BY season DESC"),
      db.prepare(
        "SELECT COUNT(*) AS rows, COUNT(DISTINCT espn_athlete_id) AS players, " +
        "COUNT(fox_athlete_id) AS fox_ids, COUNT(yahoo_player_id) AS yahoo_ids " +
        "FROM bb_player_crosswalk WHERE season=?",
      ).bind(season),
      db.prepare(
        "SELECT json_extract(receipt_json,'$.url') AS url, " +
        "json_extract(receipt_json,'$.fetched_at') AS fetched_at, " +
        "json_extract(receipt_json,'$.sha256') AS sha256 " +
        "FROM bb_sources WHERE dataset='player_crosswalk' AND season=?",
      ).bind(season),
    ]);
    const count = counts.results[0] as { rows?: number; players?: number; fox_ids?: number; yahoo_ids?: number } | undefined;
    const receipt = source.results[0] as { url?: unknown; fetched_at?: unknown; sha256?: unknown } | undefined;
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      season,
      rows: Number(count?.rows || 0),
      players: Number(count?.players || 0),
      fox_ids: Number(count?.fox_ids || 0),
      yahoo_ids: Number(count?.yahoo_ids || 0),
      source: {
        url: typeof receipt?.url === "string" ? receipt.url : null,
        fetched_at: typeof receipt?.fetched_at === "string" ? receipt.fetched_at : null,
        sha256: typeof receipt?.sha256 === "string" ? receipt.sha256 : null,
      },
      identity_note: "Source-published ESPN/Fox/Yahoo identifiers with match method and confidence retained. No NCAA ID join is asserted.",
    });
  }

  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(player_name LIKE ? OR espn_full_name LIKE ? OR fox_player LIKE ? OR yahoo_player_name LIKE ? OR espn_athlete_id LIKE ? OR fox_athlete_id LIKE ? OR yahoo_player_id LIKE ? OR team_abbreviation LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search, search, search, search, search);
  }
  if (espnId) {
    clauses.push("espn_athlete_id=?");
    binds.push(espnId);
  }
  if (provider === "fox") clauses.push("fox_athlete_id IS NOT NULL AND fox_athlete_id != ''");
  if (provider === "yahoo") clauses.push("yahoo_player_id IS NOT NULL AND yahoo_player_id != ''");
  const where = clauses.join(" AND ");
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM bb_player_crosswalk WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const rows = await db.prepare(
    `SELECT season,espn_team_id,team_abbreviation,player_name,espn_athlete_id,
      espn_full_name,espn_jersey,espn_position,fox_athlete_id,fox_player,
      fox_jersey,fox_position_group,yahoo_player_id,yahoo_player_name,
      match_method,match_confidence,match_keys
     FROM bb_player_crosswalk WHERE ${where}
     ORDER BY player_name ASC, espn_athlete_id ASC
     LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    provider,
    page,
    page_size: 40,
    total: Number(count?.total || 0),
    rows: rows.results.map((row) => ({
      ...row,
      season: Number((row as { season: unknown }).season),
      match_confidence: (row as { match_confidence: unknown }).match_confidence == null ? null : Number((row as { match_confidence: unknown }).match_confidence),
    })),
  });
});

