import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
type SourceReceipt = {
  dataset: "team_season";
  season: number;
  url: string | null;
  fetched_at: string | null;
  sha256: string | null;
};
export type TeamField = {
  category: "general" | "offensive" | "defensive";
  key: string;
  label: string;
  unit: "per game" | "percent" | "count" | "ratio";
};

const fields: TeamField[] = ([
  ["general", "assistTurnoverRatio", "Assist-to-turnover ratio", "ratio"],
  ["general", "avgFouls", "Fouls per game", "per game"],
  ["general", "avgMinutes", "Minutes per game", "per game"],
  ["general", "avgRebounds", "Rebounds per game", "per game"],
  ["general", "gamesPlayed", "Games played", "count"],
  ["general", "gamesStarted", "Games started", "count"],
  ["general", "minutes", "Minutes", "count"],
  ["general", "rebounds", "Rebounds", "count"],
  ["general", "totalRebounds", "Total rebounds", "count"],
  ["offensive", "assists", "Assists", "count"],
  ["offensive", "avgAssists", "Assists per game", "per game"],
  ["offensive", "avgFieldGoalsAttempted", "Field goals attempted per game", "per game"],
  ["offensive", "avgFieldGoalsMade", "Field goals made per game", "per game"],
  ["offensive", "avgFreeThrowsAttempted", "Free throws attempted per game", "per game"],
  ["offensive", "avgFreeThrowsMade", "Free throws made per game", "per game"],
  ["offensive", "avgOffensiveRebounds", "Offensive rebounds per game", "per game"],
  ["offensive", "avgPoints", "Points per game", "per game"],
  ["offensive", "avgThreePointFieldGoalsAttempted", "3-point attempts per game", "per game"],
  ["offensive", "avgThreePointFieldGoalsMade", "3-pointers made per game", "per game"],
  ["offensive", "avgTurnovers", "Turnovers per game", "per game"],
  ["offensive", "avgTwoPointFieldGoalsAttempted", "2-point attempts per game", "per game"],
  ["offensive", "avgTwoPointFieldGoalsMade", "2-pointers made per game", "per game"],
  ["offensive", "fieldGoalPct", "Field-goal percentage", "percent"],
  ["offensive", "fieldGoalsAttempted", "Field goals attempted", "count"],
  ["offensive", "fieldGoalsMade", "Field goals made", "count"],
  ["offensive", "freeThrowPct", "Free-throw percentage", "percent"],
  ["offensive", "freeThrowsAttempted", "Free throws attempted", "count"],
  ["offensive", "freeThrowsMade", "Free throws made", "count"],
  ["offensive", "offensiveRebounds", "Offensive rebounds", "count"],
  ["offensive", "points", "Points", "count"],
  ["offensive", "scoringEfficiency", "Scoring efficiency", "ratio"],
  ["offensive", "shootingEfficiency", "Shooting efficiency", "ratio"],
  ["offensive", "threePointFieldGoalPct", "3-point percentage", "percent"],
  ["offensive", "threePointFieldGoalsAttempted", "3-point attempts", "count"],
  ["offensive", "threePointFieldGoalsMade", "3-pointers made", "count"],
  ["offensive", "turnovers", "Turnovers", "count"],
  ["offensive", "twoPointFieldGoalPct", "2-point percentage", "percent"],
  ["offensive", "twoPointFieldGoalsAttempted", "2-point attempts", "count"],
  ["offensive", "twoPointFieldGoalsMade", "2-pointers made", "count"],
  ["defensive", "avgBlocks", "Blocks per game", "per game"],
  ["defensive", "avgDefensiveRebounds", "Defensive rebounds per game", "per game"],
  ["defensive", "avgSteals", "Steals per game", "per game"],
  ["defensive", "blocks", "Blocks", "count"],
  ["defensive", "defensiveRebounds", "Defensive rebounds", "count"],
  ["defensive", "steals", "Steals", "count"],
] as Array<[TeamField["category"], string, string, TeamField["unit"]]>).map(([category, key, label, unit]) => ({ category, key, label, unit }));

const querySchema = z.object({
  season: z.coerce.number().int().min(2024).max(2026).default(2026),
  // The publisher team-season release does not carry an explicit division.
  // Division I can be scoped by exact ESPN IDs from the retained team index;
  // lower divisions must fail closed until a source-native release exists.
  division: z.enum(["1", "2", "3", "all"]).default("all"),
  category: z.enum(["general", "offensive", "defensive"]).default("offensive"),
  stat: z.string().regex(/^[A-Za-z0-9]{1,80}$/).default("avgPoints"),
  q: z.string().trim().max(120).optional(),
  ids: z.string().trim().regex(/^[A-Za-z0-9,:_-]{0,12000}$/).optional(),
  page: z.coerce.number().int().min(0).max(250).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(40),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;
const DIVISION_INDEX_TIMEOUT_MS = 2500;

type DivisionIndex = { ids: Set<string>; season: string | null };

async function readDivisionIndex(c: { env: Bindings; req: { url: string } }, division: "1"): Promise<DivisionIndex | null> {
  if (!c.env.ASSETS) return null;
  try {
    const response = await withTimeout(
      c.env.ASSETS.fetch(new Request(new URL("/data/teams.json", c.req.url))),
      DIVISION_INDEX_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    const payload = await response.json() as { season?: unknown; teams?: unknown };
    if (!Array.isArray(payload.teams)) return null;
    const ids = new Set<string>();
    for (const value of payload.teams) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const id = (value as Record<string, unknown>).id;
      if (typeof id === "string" && /^\d+$/.test(id)) ids.add(id);
      else if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) ids.add(String(id));
    }
    return ids.size ? { ids, season: typeof payload.season === "string" ? payload.season : null } : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("team statistics query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

function sourceReceipt(season: number, receiptJson: string | null | undefined): SourceReceipt | null {
  if (!receiptJson) return null;
  try {
    const value = JSON.parse(receiptJson) as Record<string, unknown>;
    const url = typeof value.url === "string" && value.url.length <= 2000 ? value.url : null;
    const fetchedAt = typeof value.fetched_at === "string" && value.fetched_at.length <= 100 ? value.fetched_at : null;
    const sha256 = typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256) ? value.sha256.toLowerCase() : null;
    // A receipt without its content hash is not a verifiable release identity.
    if (!sha256) return null;
    return { dataset: "team_season", season, url, fetched_at: fetchedAt, sha256 };
  } catch {
    return null;
  }
}

export const teamStats = new Hono<{ Bindings: Bindings }>();
teamStats.get("/", zValidator("query", querySchema), async (c) => {
  const { season, division, category, stat, q, ids: idsQuery, page, limit, direction, meta } = c.req.valid("query");
  if (division === "2" || division === "3") {
    return c.json({
      error: `The team-season archive is not published for Division ${division}.`,
      code: "division_not_published",
      division,
      available_divisions: ["1", "all"],
      alternative: `/basketball/division-archive/?division=${division}`,
      limitation: "The retained team-season rows do not carry an explicit division, so no division is inferred from team names or publisher IDs.",
    }, 409, { "Cache-Control": "no-store" });
  }
  const divisionIndex = division === "1" ? await readDivisionIndex(c, "1") : null;
  if (division === "1" && !divisionIndex) {
    return c.json({
      error: "The exact Division I team index is temporarily unavailable.",
      code: "division_index_unavailable",
      division,
    }, 503, { "Cache-Control": "no-store" });
  }
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the source browser fail.
    }
  }
  if (meta === "1") {
    try {
      const seasons = await withTimeout(db.prepare("SELECT DISTINCT season FROM bb_team_season ORDER BY season DESC").all<{ season: number }>(), DB_TIMEOUT_MS);
      const response = c.json({
        seasons: seasons.results.map((row) => row.season),
        fields,
        division,
        available_divisions: ["1", "all"],
        division_scope: division === "1"
          ? { basis: "exact ESPN IDs from the retained D1 team index", team_count: divisionIndex?.ids.size ?? 0, season: divisionIndex?.season }
          : { basis: "all rows in the publisher team-season release; division is not source-labeled" },
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The team-field catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const field = fields.find((candidate) => candidate.category === category && candidate.key === stat);
  if (!field) return c.json({ error: "Unknown team source field" }, 400);
  const valuePath = `$.${field.category}.${field.key}.value`;
  const displayPath = `$.${field.category}.${field.key}.display`;
  const search = q ? `%${q}%` : null;
  const ids = idsQuery ? [...new Set(idsQuery.split(",").map((value) => value.trim()).filter(Boolean))] : [];
  if (ids.length > 500) return c.json({ error: "At most 500 team IDs may be requested." }, 400);
  const whereParts = ["season=?"];
  const binds: Array<string | number> = [season];
  if (divisionIndex) {
    const scopedIds = [...divisionIndex.ids];
    // D1 rejects a several-hundred-ID placeholder list on the production
    // binding limit. Keep the verified exact-ID cohort as one JSON parameter
    // and let SQLite's JSON1 table-valued function perform the membership
    // test without changing the source boundary.
    whereParts.push("team_id IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(scopedIds));
  }
  if (search) {
    whereParts.push("(team_name LIKE ? OR team_id LIKE ?)");
    binds.push(search, search);
  }
  if (ids.length) {
    whereParts.push(`team_id IN (${ids.map(() => "?").join(",")})`);
    binds.push(...ids);
  }
  const where = whereParts.join(" AND ");
  try {
    const count = await withTimeout(db.prepare(
      `SELECT count(*) AS total, count(json_extract(stats_json, ?)) AS non_null FROM bb_team_season WHERE ${where}`,
    ).bind(valuePath, ...binds).first<{ total: number; non_null: number }>(), DB_TIMEOUT_MS);
  const order = `json_extract(stats_json, '${valuePath}') IS NULL, json_extract(stats_json, '${valuePath}') ${direction === "asc" ? "ASC" : "DESC"}, team_name ASC, team_id ASC`;
    const rows = await withTimeout(db.prepare(
    `SELECT team_id,team_name,team_abbreviation,
            json_extract(stats_json, '${valuePath}') AS value,
            json_extract(stats_json, '${displayPath}') AS display,
            CASE WHEN json_extract(stats_json, '${valuePath}') IS NULL THEN NULL
                 ELSE RANK() OVER (
                   ORDER BY json_extract(stats_json, '${valuePath}') IS NULL,
                            json_extract(stats_json, '${valuePath}') ${direction === "asc" ? "ASC" : "DESC"}
                 )
            END AS rank
       FROM bb_team_season WHERE ${where}
      ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).bind(...binds, limit, page * limit).all(), DB_TIMEOUT_MS);
    // Keep the aggregate row and its immutable source release together. A
    // missing or malformed receipt stays null; it must never be replaced by
    // a guessed URL or an unverified publisher label.
    let source: SourceReceipt | null = null;
    try {
      const receipt = await withTimeout(db.prepare(
        "SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?",
      ).bind("team_season", season).first<{ receipt_json?: string }>(), DB_TIMEOUT_MS);
      source = sourceReceipt(season, receipt?.receipt_json);
    } catch {
      source = null;
    }
    const response = c.json({
    season, division, field, page, page_size: limit,
    total: count?.total ?? 0, non_null: count?.non_null ?? 0,
    ranking: {
      direction,
      population: "matching rows with a recorded metric value",
      ranked_count: count?.non_null ?? 0,
      ties: "competition_rank",
    },
    division_scope: division === "1"
      ? { basis: "exact ESPN IDs from the retained D1 team index", team_count: divisionIndex?.ids.size ?? 0, season: divisionIndex?.season }
      : { basis: "all rows in the publisher team-season release; division is not source-labeled" },
    source,
    rows: rows.results.map((row) => ({
      id: row.team_id, team: row.team_name || row.team_id, abbreviation: row.team_abbreviation,
      value: typeof row.value === "number" ? row.value : null,
      display: row.display == null ? null : String(row.display),
      rank: typeof row.rank === "number" && Number.isInteger(row.rank) ? row.rank : null,
    })),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The team statistics archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
