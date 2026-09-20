import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

type Bindings = Env;
type SeasonSourceRow = {
  season: number;
  player_id: string;
  team_id: string;
  player_name: string | null;
  team_name: string | null;
  games: number;
  stats_json: string;
};
type RosterSourceRow = {
  season: number;
  player_id: string;
  team_id: string;
  team_name: string | null;
  player_name: string | null;
  profile_json: string;
};

const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  ids: z.string().trim().regex(/^\d{1,15}(?:,\d{1,15}){0,2}$/),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NCAA player comparison query timed out")), milliseconds);
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

export const ncaaPlayerComparison = new Hono<{ Bindings: Bindings }>();

/**
 * Return one coherent comparison cohort for up to three exact NCAA player IDs.
 * Every player row, roster row and source receipt belongs to the requested
 * season; names are display fields and are never used as join keys.
 */
ncaaPlayerComparison.get("/", zValidator("query", querySchema), async (c) => {
  const { season, ids: idsQuery } = c.req.valid("query");
  const ids = [...new Set(idsQuery.split(","))];
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the comparison fail.
    }
  }
  const placeholders = ids.map(() => "?").join(",");
  try {
    const db = researchDb(c.env);
    const [seasonRows, rosterRows, receiptRows] = await withTimeout(db.batch([
      db.prepare(`SELECT season,player_id,team_id,player_name,team_name,games,stats_json
        FROM bb_ncaa_player_season
        WHERE season=? AND player_id IN (${placeholders})
        ORDER BY player_id,team_name,team_id`).bind(season, ...ids),
      db.prepare(`SELECT season,player_id,team_id,team_name,player_name,profile_json
        FROM bb_ncaa_rosters
        WHERE season=? AND player_id IN (${placeholders})
        ORDER BY player_id,team_name,team_id`).bind(season, ...ids),
      db.prepare(`SELECT dataset,season,receipt_json FROM bb_sources
        WHERE season=? AND dataset IN ('ncaa_player_box','ncaa_team_rosters','ncaa_rapm','player_season')
        ORDER BY dataset`).bind(season),
    ]), DB_TIMEOUT_MS);
    const seasons = (seasonRows.results as SeasonSourceRow[]).flatMap(({ stats_json, ...row }) => {
      const stats = parseObject(stats_json);
      return stats ? [{ ...row, stats }] : [];
    });
    const rosters = (rosterRows.results as RosterSourceRow[]).flatMap(({ profile_json, ...row }) => {
      const profile = parseObject(profile_json);
      return profile ? [{ ...row, profile }] : [];
    });
    const sourceReceipts = (receiptRows.results as Array<{ dataset: string; season: number; receipt_json: string }>).flatMap((row) => {
      const receipt = parseObject(row.receipt_json);
      return typeof receipt?.url === "string" && typeof receipt.fetched_at === "string" && typeof receipt.sha256 === "string"
        ? [{ dataset: row.dataset, season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }]
        : [];
    });
    const cards = ids.flatMap((playerId) => {
      const playerSeasons = seasons.filter((row) => String(row.player_id) === playerId);
      if (!playerSeasons.length) return [];
      return [{
        player_id: playerId,
        selected_season: season,
        seasons: playerSeasons,
        rosters: rosters.filter((row) => String(row.player_id) === playerId),
        identity_note: "NCAA source ID namespace; no name-only join to other identities.",
      }];
    });
    const found = new Set(cards.map((card) => card.player_id));
    const response = c.json({
      season,
      requested_ids: ids,
      missing_ids: ids.filter((id) => !found.has(id)),
      cards,
      source_receipts: sourceReceipts,
      identity_policy: "Player and roster rows are joined only by the requested NCAA player ID and season. Missing source fields remain unavailable.",
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The NCAA player comparison is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
