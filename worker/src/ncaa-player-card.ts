import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
});

export const ncaaPlayerCard = new Hono<{ Bindings: Bindings }>();

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
    identity_note: "NCAA source ID namespace; no name-only join to ESPN identities.",
  });
});
