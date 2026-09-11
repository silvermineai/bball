import { researchDb } from "./research-db";
import { Hono } from "hono";

type Profile = { id: string; games: { id: string }[]; [key: string]: unknown };
type Shot = {
  id: string;
  team: string;
  player: string | null;
  [key: string]: unknown;
};
export const shooting = new Hono<{ Bindings: Env }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("shooting archive query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

shooting.get("/:kind/:id", async (c) => {
  const { kind, id } = c.req.param();
  const seasonText = c.req.query("season") ?? "2026";
  if (
    !["team", "player"].includes(kind) ||
    !/^\d{1,15}$/.test(id) ||
    !/^\d{4}$/.test(seasonText) ||
    +seasonText < 2024 ||
    +seasonText > 2035
  ) {
    return c.json({ error: "Invalid shooting profile parameters" }, 400);
  }
  const season = +seasonText;
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the shooting browser fail.
    }
  }
  let row: { payload_json: string; edition: string; receipt_json: string } | null;
  try {
    row = await withTimeout(db.prepare(
    `SELECT p.payload_json,s.edition,s.receipt_json
    FROM bb_shot_profiles p JOIN bb_shot_sources s ON s.season=p.season AND s.edition=p.edition
    WHERE p.season=? AND p.kind=? AND p.entity_id=?`,
  )
    .bind(season, kind, id).first<{ payload_json: string; edition: string; receipt_json: string }>(), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The shooting archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  if (!row)
    return c.json({ error: "No shooting evidence for this selection" }, 404);
  let profile: Profile;
  try {
    profile = JSON.parse(row.payload_json) as Profile;
    if (!profile || typeof profile !== "object" || !Array.isArray(profile.games)) throw new Error("invalid shooting profile");
  } catch {
    return c.json({ error: "The shooting profile is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  const games = [...new Set(profile.games.map((g) => g.id))];
  // Bound SQL parameters and return every recorded game, including multi-team players.
  const chunks = [];
  for (let i = 0; i < games.length; i += 40) {
    const ids = games.slice(i, i + 40);
    chunks.push(
      db.prepare(
        `SELECT game_id,payload_json FROM bb_shot_games WHERE edition=? AND season=? AND game_id IN (${ids.map(() => "?").join(",")}) ORDER BY game_id,part`,
      ).bind(row.edition, season, ...ids),
    );
  }
  let results: Array<{ results: Array<{ game_id: string; payload_json: string }> }>;
  try {
    results = chunks.length ? await withTimeout(db.batch<{ game_id: string; payload_json: string }>(chunks), DB_TIMEOUT_MS) : [];
  } catch {
    return c.json({ error: "The shooting archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  const shots = results.flatMap((result) =>
    result.results.flatMap((game) => {
      try {
        const parsed = JSON.parse(game.payload_json) as Shot[];
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter((s) => s && typeof s === "object" && (kind === "team" ? s.team : s.player) === id)
          .map((s) => ({ ...s, game: game.game_id }));
      } catch {
        return [];
      }
    }),
  );
  let source: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(row.receipt_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) source = parsed as Record<string, unknown>;
  } catch {
    // Keep the profile and shot rows usable when only the receipt is malformed.
  }
  const response = c.json({
    profile,
    shots,
    source,
    edition: row.edition,
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});
