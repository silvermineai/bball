import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { footballDb } from "./football-db";
import { z } from "zod";

const metrics = {
  defense: [
    "sacks",
    "sacks_yards",
    "interceptions",
    "interceptions_yards",
    "pass_breakups",
    "forced_fumbles",
    "fumble_recoveries",
    "fumble_recoveries_yards",
  ],
  specialists: [
    "field_goals",
    "field_goals_yards",
    "punts",
    "punts_yards",
    "kick_returns",
    "kick_returns_yards",
    "punt_returns",
    "punt_returns_yards",
  ],
} as const;
const query = z.object({
  view: z.enum(["records", "leaders"]).default("records"),
  dataset: z.enum(["defense", "specialists"]).default("defense"),
  season: z.coerce.number().int().min(2022).max(2035).default(2025),
  edition: z
    .string()
    .regex(/^football-events-[a-f0-9]{20}$/)
    .optional(),
  team: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
  game: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
  q: z.string().trim().max(100).default(""),
  division: z.enum(["all", "fbs", "fcs"]).default("all"),
  sort: z.string().default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  positive: z.enum(["0", "1"]).default("0"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});
export const footballEvents = new Hono<{ Bindings: Env }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("football event query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

footballEvents.get("/", zValidator("query", query), async (c) => {
  const q = c.req.valid("query");
  const keys: readonly string[] = metrics[q.dataset];
  if (
    (q.sort !== "date" && !keys.includes(q.sort)) ||
    (q.positive === "1" && q.sort === "date")
  )
    return c.json(
      { error: "Choose a valid event metric for these filters" },
      400,
    );
  if (q.view === "leaders" && q.sort === "date")
    return c.json(
      { error: "Choose a metric when browsing player leaders" },
      400,
    );
  const db = footballDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the event notebook fail.
    }
  }
  let edition: {
    edition: string;
    generated_at: string;
    receipt_json: string;
    coverage_json: string;
  } | null;
  try {
    edition = await withTimeout(db.prepare(
    `SELECT e.* FROM football_event_editions e ${q.edition ? "" : "JOIN football_event_active a ON a.edition=e.edition AND a.dataset=e.dataset AND a.season=e.season"}
     WHERE e.dataset=? AND e.season=? ${q.edition ? "AND e.edition=?" : ""}`,
  )
    .bind(...[q.dataset, q.season, ...(q.edition ? [q.edition] : [])])
    .first<{
      edition: string;
      generated_at: string;
      receipt_json: string;
      coverage_json: string;
    }>(), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The football event archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  if (!edition)
    return c.json({ error: "This source edition has not been published" }, 404);
  const conditions = ["edition=?"];
  const values: (string | number)[] = [edition.edition];
  for (const [key, value] of [
    ["team_id", q.team],
    ["game_id", q.game],
  ] as const) {
    if (value) {
      conditions.push(`${key}=?`);
      values.push(value);
    }
  }
  if (q.q) {
    conditions.push("instr(lower(player_name),lower(?))>0");
    values.push(q.q);
  }
  if (q.division !== "all") {
    conditions.push("division=?");
    values.push(q.division);
  }
  // Only allow-listed paths reach SQL. The publisher stores finite JSON numbers or null.
  const sort =
    q.sort === "date"
      ? "kickoff"
      : `json_extract(payload_json,'$.metrics.${q.sort}')`;
  if (q.positive === "1" && q.view === "records") conditions.push(`${sort}>0`);
  const where = conditions.join(" AND ");
  const metric = `json_extract(payload_json,'$.metrics.${q.sort}')`;
  if (q.view === "leaders") {
    const grouped = `SELECT player_name,team_id,division,
        MAX(json_extract(payload_json,'$.team')) AS team,
        COUNT(*) AS records, COUNT(DISTINCT game_id) AS games,
        SUM(${metric}) AS value
      FROM football_events WHERE ${where}
      GROUP BY player_name,team_id,division`;
    const leaderFilter = q.positive === "1" ? "value>0" : "value IS NOT NULL";
    let count: { total: number } | null;
    let rows: { results: Array<{ player_name: string; team_id: string | null; division: string | null; team: string | null; records: number; games: number; value: number | null }> };
    try {
      [count, rows] = await withTimeout(Promise.all([
      db.prepare(`SELECT count(*) AS total FROM (${grouped}) leaders WHERE ${leaderFilter}`)
        .bind(...values)
        .first<{ total: number }>(),
      db.prepare(
        `SELECT * FROM (${grouped}) leaders
         WHERE ${leaderFilter}
         ORDER BY value IS NULL,value ${q.direction.toUpperCase()},player_name ASC,team_id ASC
         LIMIT 40 OFFSET ?`,
      )
        .bind(...values, q.page * 40)
        .all<{ player_name: string; team_id: string | null; division: string | null; team: string | null; records: number; games: number; value: number | null }>(),
      ]), DB_TIMEOUT_MS);
    } catch {
      return c.json({ error: "The football event archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
    const response = c.json({
      view: q.view,
      dataset: q.dataset,
      season: q.season,
      page: q.page,
      page_size: 40,
      total: count?.total ?? 0,
      edition: edition.edition,
      evidence: parseJson(edition.receipt_json),
      coverage: parseJson(edition.coverage_json),
      metric: q.sort,
      direction: q.direction,
      rows: rows.results,
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  }
  let count: { total: number } | null;
  let rows: { results: Array<{ payload_json: string }> };
  try {
    [count, rows] = await withTimeout(Promise.all([
    db.prepare(
      `SELECT count(*) AS total FROM football_events WHERE ${where}`,
    )
      .bind(...values)
      .first<{ total: number }>(),
    db.prepare(
      `SELECT payload_json FROM football_events WHERE ${where}
      ORDER BY ${sort} IS NULL,${sort} ${q.direction.toUpperCase()},record_key ASC LIMIT 40 OFFSET ?`,
    )
      .bind(...values, q.page * 40)
      .all<{ payload_json: string }>(),
    ]), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The football event archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  const response = c.json({
    view: q.view,
    dataset: q.dataset,
    season: q.season,
    edition: edition.edition,
    generated_at: edition.generated_at,
    page: q.page,
    page_size: 40,
    total: count?.total ?? 0,
    filters: {
      team: q.team ?? null,
      game: q.game ?? null,
      q: q.q,
      division: q.division,
      sort: q.sort,
      direction: q.direction,
      positive: q.positive === "1",
    },
    evidence: parseJson(edition.receipt_json),
    coverage: parseJson(edition.coverage_json),
    rows: rows.results.flatMap((r) => {
      const parsed = parseJson(r.payload_json);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed] : [];
    }),
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});
