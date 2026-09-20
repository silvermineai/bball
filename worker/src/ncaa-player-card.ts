import { ncaaBoxDb, researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
});
const gamesQuerySchema = z.object({
  season: z.union([z.coerce.number().int().min(2010).max(2026), z.literal("all")]).default(2026),
  page: z.coerce.number().int().min(0).max(100).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export const ncaaPlayerCard = new Hono<{ Bindings: Bindings }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NCAA player card query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function validReceipt(row: { dataset: string; season: number; receipt_json: string }) {
  const receipt = parseObject(row.receipt_json);
  const fetchedAt = typeof receipt?.fetched_at === "string" ? Date.parse(receipt.fetched_at) : Number.NaN;
  return Number.isInteger(row.season)
    && typeof receipt?.url === "string"
    && /^https?:\/\//.test(receipt.url)
    && Number.isFinite(fetchedAt)
    && typeof receipt?.sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(receipt.sha256)
      ? { dataset: row.dataset, season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }
      : null;
}

// Keep the card quick to load while allowing staff to retrieve the complete
// season evidence when they need to audit every contest behind a total.
ncaaPlayerCard.get("/:id/games", zValidator("query", gamesQuerySchema), async (c) => {
  const playerId = c.req.param("id");
  if (!/^\d{1,15}$/.test(playerId)) return c.json({ error: "Invalid NCAA player ID" }, 400);
  const { season, page, limit } = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the player archive fail.
    }
  }
  try {
    const gameDb = ncaaBoxDb(c.env);
    const allSeasons = season === "all";
    // The player-first index keeps this career view bounded even though the
    // game archive is partitioned by season. Keep the season predicate when a
    // caller asks for one edition so the existing hot path remains selective.
    const countStatement = allSeasons
      ? gameDb.prepare("SELECT count(*) AS total FROM bb_ncaa_player_box WHERE player_id=?").bind(playerId)
      : gameDb.prepare("SELECT count(*) AS total FROM bb_ncaa_player_box WHERE player_id=? AND season=?").bind(playerId, season);
    const rowsStatement = allSeasons
      ? gameDb.prepare("SELECT season,contest_id,team_id,game_date,team_name,opponent_name,player_name,stats_json FROM bb_ncaa_player_box WHERE player_id=? ORDER BY season DESC,game_date DESC,contest_id DESC LIMIT ? OFFSET ?").bind(playerId, limit, page * limit)
      : gameDb.prepare("SELECT season,contest_id,team_id,game_date,team_name,opponent_name,player_name,stats_json FROM bb_ncaa_player_box WHERE player_id=? AND season=? ORDER BY game_date DESC,contest_id DESC LIMIT ? OFFSET ?").bind(playerId, season, limit, page * limit);
    const [count, result] = await withTimeout(gameDb.batch([
      countStatement,
      rowsStatement,
    ]), DB_TIMEOUT_MS);
    const total = Number((count.results[0] as { total?: number } | undefined)?.total || 0);
    if (!total) return c.json({ error: "No NCAA game rows found" }, 404);
    const response = c.json({
      player_id: playerId,
      season,
      page,
      page_size: limit,
      total,
      rows: (result.results as Array<Record<string, unknown>>).flatMap(({ stats_json, ...row }) => {
        const stats = parseObject(stats_json);
        return stats ? [{ ...row, stats }] : [];
      }),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The NCAA player game archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});

ncaaPlayerCard.get("/:id", zValidator("query", querySchema), async (c) => {
  const playerId = c.req.param("id");
  if (!/^\d{1,15}$/.test(playerId)) return c.json({ error: "Invalid NCAA player ID" }, 400);
  const { season } = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the player card fail.
    }
  }
  try {
    const db = researchDb(c.env);
    const [seasons, rosters, shooting] = await withTimeout(db.batch([
      db.prepare("SELECT season,player_id,team_id,player_name,team_name,games,stats_json FROM bb_ncaa_player_season WHERE player_id=? ORDER BY season DESC,team_name ASC").bind(playerId),
      db.prepare("SELECT season,team_id,team_name,player_name,profile_json FROM bb_ncaa_rosters WHERE player_id=? ORDER BY season DESC,team_name ASC").bind(playerId),
      db.prepare("SELECT season,team_id,team_name,player_name,stats_json FROM bb_ncaa_player_shooting WHERE player_id=? ORDER BY season DESC,team_name ASC").bind(playerId),
    ]), DB_TIMEOUT_MS);
    const games = await withTimeout(ncaaBoxDb(c.env).prepare("SELECT season,contest_id,team_id,game_date,team_name,opponent_name,player_name,stats_json FROM bb_ncaa_player_box WHERE player_id=? AND season=? ORDER BY game_date DESC,contest_id DESC LIMIT 12").bind(playerId, season).all(), DB_TIMEOUT_MS);
    const receipts = await withTimeout(db.prepare(
      "SELECT dataset,season,receipt_json FROM bb_sources WHERE dataset IN ('ncaa_player_box','ncaa_shots','ncaa_team_rosters','ncaa_rapm','player_season') ORDER BY season DESC,dataset",
    ).all<{ dataset: string; season: number; receipt_json: string }>(), DB_TIMEOUT_MS);
    const sourceReceipts = receipts.results.flatMap((row) => {
      const receipt = validReceipt(row);
      return receipt ? [receipt] : [];
    });
    const rows = (seasons.results as Array<Record<string, unknown>>).flatMap(({ stats_json, ...row }) => { const stats = parseObject(stats_json); return stats ? [{ ...row, stats }] : []; });
    const rosterRows = (rosters.results as Array<Record<string, unknown>>).flatMap(({ profile_json, ...row }) => { const profile = parseObject(profile_json); return profile ? [{ ...row, profile }] : []; });
    const shotRows = (shooting.results as Array<Record<string, unknown>>).flatMap(({ stats_json, ...row }) => { const stats = parseObject(stats_json); return stats ? [{ ...row, stats }] : []; });
    if (!rows.length && !rosterRows.length && !shotRows.length) return c.json({ error: "NCAA player not found" }, 404);
    const retainedSeasons = new Set([
      ...rows.map((row) => Number((row as Record<string, unknown>).season)),
      ...rosterRows.map((row) => Number((row as Record<string, unknown>).season)),
      ...shotRows.map((row) => Number((row as Record<string, unknown>).season)),
    ].filter((value) => Number.isInteger(value)));
    const careerSourceReceipts = sourceReceipts.filter((receipt) => retainedSeasons.has(receipt.season));
    const response = c.json({
      player_id: playerId,
      selected_season: season,
      seasons: rows,
      rosters: rosterRows,
      shooting: shotRows,
      games: (games.results as Array<Record<string, unknown>>).flatMap(({ stats_json, ...row }) => { const stats = parseObject(stats_json); return stats ? [{ ...row, stats }] : []; }),
      source_receipts: careerSourceReceipts.filter((receipt) => receipt.season === season),
      career_source_receipts: careerSourceReceipts,
      identity_note: "NCAA source ID namespace; no name-only join to ESPN identities.",
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The NCAA player card is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
