import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
});
const gamesQuerySchema = querySchema.extend({
  page: z.coerce.number().int().min(0).max(100).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export const ncaaPlayerCard = new Hono<{ Bindings: Bindings }>();

// Keep the card quick to load while allowing staff to retrieve the complete
// season evidence when they need to audit every contest behind a total.
ncaaPlayerCard.get("/:id/games", zValidator("query", gamesQuerySchema), async (c) => {
  const playerId = c.req.param("id");
  if (!/^\d{1,15}$/.test(playerId)) return c.json({ error: "Invalid NCAA player ID" }, 400);
  const { season, page, limit } = c.req.valid("query");
  const [count, result] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT count(*) AS total FROM bb_ncaa_player_box WHERE player_id=? AND season=?").bind(playerId, season),
    c.env.DB.prepare("SELECT season,contest_id,team_id,game_date,team_name,opponent_name,player_name,stats_json FROM bb_ncaa_player_box WHERE player_id=? AND season=? ORDER BY game_date DESC,contest_id DESC LIMIT ? OFFSET ?").bind(playerId, season, limit, page * limit),
  ]);
  const total = Number((count.results[0] as { total?: number } | undefined)?.total || 0);
  if (!total) return c.json({ error: "No NCAA game rows found" }, 404);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    player_id: playerId,
    season,
    page,
    page_size: limit,
    total,
    rows: (result.results as Array<Record<string, unknown>>).map(({ stats_json, ...row }) => {
      let stats: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(stats_json));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stats = parsed as Record<string, unknown>;
      } catch {
        // Keep the row available for identity and contest auditing.
      }
      return { ...row, stats };
    }),
  });
});

ncaaPlayerCard.get("/:id", zValidator("query", querySchema), async (c) => {
  const playerId = c.req.param("id");
  if (!/^\d{1,15}$/.test(playerId)) return c.json({ error: "Invalid NCAA player ID" }, 400);
  const { season } = c.req.valid("query");
  const [seasons, rosters, shooting, games] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT season,player_id,team_id,player_name,team_name,games,stats_json FROM bb_ncaa_player_season WHERE player_id=? ORDER BY season DESC,team_name ASC").bind(playerId),
    c.env.DB.prepare("SELECT season,team_id,team_name,player_name,profile_json FROM bb_ncaa_rosters WHERE player_id=? ORDER BY season DESC,team_name ASC").bind(playerId),
    c.env.DB.prepare("SELECT season,team_id,team_name,player_name,stats_json FROM bb_ncaa_player_shooting WHERE player_id=? ORDER BY season DESC,team_name ASC").bind(playerId),
    c.env.DB.prepare("SELECT season,contest_id,team_id,game_date,team_name,opponent_name,player_name,stats_json FROM bb_ncaa_player_box WHERE player_id=? AND season=? ORDER BY game_date DESC,contest_id DESC LIMIT 12").bind(playerId, season),
  ]);
  const receipts = await c.env.DB.prepare(
    "SELECT dataset,season,receipt_json FROM bb_sources WHERE season=? AND dataset IN ('ncaa_player_box','ncaa_shots','ncaa_team_rosters','ncaa_rapm','player_season') ORDER BY dataset",
  ).bind(season).all<{ dataset: string; season: number; receipt_json: string }>();
  const sourceReceipts = receipts.results.flatMap((row) => {
    try {
      const receipt = JSON.parse(row.receipt_json) as { url?: unknown; fetched_at?: unknown; sha256?: unknown };
      if (typeof receipt.url !== "string" || typeof receipt.fetched_at !== "string" || typeof receipt.sha256 !== "string") return [];
      return [{ dataset: row.dataset, season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }];
    } catch {
      return [];
    }
  });
  const rows = seasons.results as Array<Record<string, unknown>>;
  const rosterRows = rosters.results as Array<Record<string, unknown>>;
  const shotRows = shooting.results as Array<Record<string, unknown>>;
  if (!rows.length && !rosterRows.length && !shotRows.length) return c.json({ error: "NCAA player not found" }, 404);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    player_id: playerId,
    selected_season: season,
    seasons: rows.map(({ stats_json, ...row }) => ({ ...row, stats: JSON.parse(String(stats_json)) })),
    rosters: rosterRows.map(({ profile_json, ...row }) => ({ ...row, profile: JSON.parse(String(profile_json)) })),
    shooting: shotRows.map(({ stats_json, ...row }) => ({ ...row, stats: JSON.parse(String(stats_json)) })),
    games: (games.results as Array<Record<string, unknown>>).map(({ stats_json, ...row }) => ({ ...row, stats: JSON.parse(String(stats_json)) })),
    source_receipts: sourceReceipts,
    identity_note: "NCAA source ID namespace; no name-only join to ESPN identities.",
  });
});
