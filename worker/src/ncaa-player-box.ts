import { ncaaBoxDb, researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
type ArchiveValidation = {
  total_rows: number;
  missing_ids: number;
  missing_names: number;
  missing_game_dates: number;
  malformed_game_dates: number;
  same_team_opponent: number;
  malformed_stats_json: number;
  invalid_possessions: number;
  impossible_shooting: number;
  invalid_minutes: number;
  zero_minutes_with_stats: number;
};

const validationSql = `SELECT count(*) AS total_rows,
  sum(CASE WHEN trim(contest_id)='' OR trim(team_id)='' OR trim(player_id)='' THEN 1 ELSE 0 END) AS missing_ids,
  sum(CASE WHEN team_name IS NULL OR trim(team_name)='' OR opponent_name IS NULL OR trim(opponent_name)='' OR player_name IS NULL OR trim(player_name)='' THEN 1 ELSE 0 END) AS missing_names,
  sum(CASE WHEN game_date IS NULL OR trim(game_date)='' THEN 1 ELSE 0 END) AS missing_game_dates,
  sum(CASE WHEN game_date IS NOT NULL AND trim(game_date)<>'' AND (game_date NOT GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]' OR date(substr(game_date,7,4)||'-'||substr(game_date,1,2)||'-'||substr(game_date,4,2)) IS NULL) THEN 1 ELSE 0 END) AS malformed_game_dates,
  sum(CASE WHEN lower(trim(team_name))=lower(trim(opponent_name)) AND trim(team_name)<>'' THEN 1 ELSE 0 END) AS same_team_opponent,
  sum(CASE WHEN json_valid(stats_json)=0 THEN 1 ELSE 0 END) AS malformed_stats_json,
  sum(CASE WHEN json_valid(stats_json)=1 AND json_extract(stats_json,'$.o_poss') IS NOT NULL AND json_extract(stats_json,'$.o_poss')<0 THEN 1 ELSE 0 END) AS invalid_possessions,
  sum(CASE WHEN json_valid(stats_json)=1 AND (json_extract(stats_json,'$.fgm')>json_extract(stats_json,'$.fga') OR json_extract(stats_json,'$.tpm')>json_extract(stats_json,'$.tpa') OR json_extract(stats_json,'$.ftm')>json_extract(stats_json,'$.fta') OR json_extract(stats_json,'$.rimm')>json_extract(stats_json,'$.rima') OR json_extract(stats_json,'$.midm')>json_extract(stats_json,'$.mida') OR json_extract(stats_json,'$.pbackm')>json_extract(stats_json,'$.pbacka')) THEN 1 ELSE 0 END) AS impossible_shooting,
  sum(CASE WHEN json_valid(stats_json)=1 AND json_extract(stats_json,'$.mins') IS NOT NULL AND (json_extract(stats_json,'$.mins')<0 OR json_extract(stats_json,'$.mins')>60) THEN 1 ELSE 0 END) AS invalid_minutes,
  sum(CASE WHEN json_valid(stats_json)=1 AND json_extract(stats_json,'$.mins')=0 AND (json_extract(stats_json,'$.pts')>0 OR json_extract(stats_json,'$.fga')>0 OR json_extract(stats_json,'$.fta')>0 OR json_extract(stats_json,'$.orb')>0 OR json_extract(stats_json,'$.drb')>0 OR json_extract(stats_json,'$.ast')>0 OR json_extract(stats_json,'$.o_poss')>0) THEN 1 ELSE 0 END) AS zero_minutes_with_stats
  FROM bb_ncaa_player_box WHERE season=?`;

function parseValidation(row: Record<string, unknown> | undefined): ArchiveValidation | null {
  if (!row) return null;
  const value = (key: keyof ArchiveValidation) => Number(row[key] || 0);
  return {
    total_rows: value("total_rows"),
    missing_ids: value("missing_ids"),
    missing_names: value("missing_names"),
    missing_game_dates: value("missing_game_dates"),
    malformed_game_dates: value("malformed_game_dates"),
    same_team_opponent: value("same_team_opponent"),
    malformed_stats_json: value("malformed_stats_json"),
    invalid_possessions: value("invalid_possessions"),
    impossible_shooting: value("impossible_shooting"),
    invalid_minutes: value("invalid_minutes"),
    zero_minutes_with_stats: value("zero_minutes_with_stats"),
  };
}

const querySchema = z.object({
  season: z.union([z.coerce.number().int().min(2010).max(2026), z.literal("all")]).default(2026),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  archive: z.enum(["auto", "games", "season"]).default("auto"),
  meta: z.enum(["0", "1"]).default("0"),
});
const sourceSchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026),
});

export const ncaaPlayerBox = new Hono<{ Bindings: Bindings }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NCAA player archive database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

ncaaPlayerBox.get("/source", zValidator("query", sourceSchema), async (c) => {
  const { season } = c.req.valid("query");
  const catalogResponse = await c.env.ASSETS.fetch(
    new Request(new URL("/data/basketball/ncaa-player-box-catalog.json", c.req.url)),
  );
  if (!catalogResponse.ok) return c.text("NCAA source catalog is unavailable", 503);
  let receipt: { sha256?: unknown; season?: unknown } | undefined;
  try {
    const catalog = (await catalogResponse.json()) as {
      seasons?: Array<{ season?: unknown; sha256?: unknown }>;
    };
    receipt = catalog.seasons?.find((entry) => Number(entry.season) === season);
  } catch {
    return c.text("NCAA source catalog is invalid", 503);
  }
  const digest = typeof receipt?.sha256 === "string" ? receipt.sha256 : "";
  if (!receipt || !/^[a-f0-9]{64}$/.test(digest) || Number(receipt.season) !== season) {
    return c.text("NCAA source release not found", 404);
  }
  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_player_box_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) {
    return new Response(null, { status: 304, headers });
  }
  const object = await c.env.RESEARCH_ARCHIVE.get(
    `basketball/ncaa-player-box/${season}/${digest}.parquet`,
  );
  if (!object || !("body" in object)) {
    return c.text("NCAA source release is temporarily unavailable", 503);
  }
  return new Response(object.body, { headers });
});

ncaaPlayerBox.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, page, archive, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  const gameDb = ncaaBoxDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the archive fail.
    }
  }
  if (meta === "1") {
    if (season === "all") {
      try {
        const dedicatedGameDb = (c.env as Env & { NCAA_BOX_DB?: D1Database }).NCAA_BOX_DB;
        const gameDbForAll = dedicatedGameDb || db;
        const [gameSeasons, seasonSeasons, gameCount, seasonCount, source] = await withTimeout(Promise.all([
          gameDbForAll.prepare("SELECT DISTINCT season FROM bb_ncaa_player_box ORDER BY season DESC").all(),
          db.prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC").all(),
          gameDbForAll.prepare("SELECT count(*) AS total FROM bb_ncaa_player_box").first<{ total: number }>(),
          db.prepare("SELECT count(*) AS total FROM bb_ncaa_player_season").first<{ total: number }>(),
          db.prepare("SELECT json_extract(receipt_json,'$.url') AS url, json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='ncaa_player_box' ORDER BY season DESC LIMIT 1").first(),
        ]), DB_TIMEOUT_MS);
        const sourceRow = source as { url?: unknown; fetched_at?: unknown; sha256?: unknown } | undefined;
        const seasons = [...new Set([
          gameSeasons.results.map((row) => Number((row as { season: number }).season)),
          seasonSeasons.results.map((row) => Number((row as { season: number }).season)),
        ].flat())].sort((a, b) => b - a);
        const response = c.json({
          seasons,
          total: Number((gameCount?.total || seasonCount?.total || 0)),
          source: {
            url: typeof sourceRow?.url === "string" ? sourceRow.url : null,
            fetched_at: typeof sourceRow?.fetched_at === "string" ? sourceRow.fetched_at : null,
            sha256: typeof sourceRow?.sha256 === "string" ? sourceRow.sha256 : null,
          },
          validation: null,
        });
        response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
        if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
        return response;
      } catch {
        return c.json({ error: "The NCAA player archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
      }
    }
    // Preserve the compact single-database path for local fixtures and older
    // deployments. The dedicated binding uses the split path below.
    const dedicatedGameDb = (c.env as Env & { NCAA_BOX_DB?: D1Database }).NCAA_BOX_DB;
    if (!dedicatedGameDb) {
      try {
        const [legacySeasons, count, source, validation] = await withTimeout(db.batch([
          db.prepare("SELECT season FROM bb_ncaa_player_box UNION SELECT season FROM bb_ncaa_player_season ORDER BY season DESC"),
          db.prepare("SELECT (SELECT count(*) FROM bb_ncaa_player_box WHERE season=?) + (CASE WHEN (SELECT count(*) FROM bb_ncaa_player_box WHERE season=?)=0 THEN (SELECT count(*) FROM bb_ncaa_player_season WHERE season=?) ELSE 0 END) AS total").bind(season, season, season),
          db.prepare("SELECT json_extract(receipt_json,'$.url') AS url, json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='ncaa_player_box' AND season=?").bind(season),
          db.prepare(validationSql).bind(season),
        ]), DB_TIMEOUT_MS);
        const sourceRow = source.results[0] as { url?: unknown; fetched_at?: unknown; sha256?: unknown } | undefined;
        const validationRow = validation?.results[0] as Record<string, unknown> | undefined;
        const response = c.json({
          seasons: legacySeasons.results.map((row) => Number((row as { season: number }).season)),
          total: Number((count.results[0] as { total: number }).total || 0),
          source: {
            url: typeof sourceRow?.url === "string" ? sourceRow.url : null,
            fetched_at: typeof sourceRow?.fetched_at === "string" ? sourceRow.fetched_at : null,
            sha256: typeof sourceRow?.sha256 === "string" ? sourceRow.sha256 : null,
          },
          validation: parseValidation(validationRow),
        });
        response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
        if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
        return response;
      } catch {
        return c.json({ error: "The NCAA player archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
      }
    }
    try {
      const [gameSeasons, seasonSeasons, gameCount, seasonCount, source, validation] = await withTimeout(Promise.all([
        gameDb.prepare("SELECT DISTINCT season FROM bb_ncaa_player_box ORDER BY season DESC").all(),
        db.prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC").all(),
        gameDb.prepare("SELECT count(*) AS total FROM bb_ncaa_player_box WHERE season=?").bind(season).first<{ total: number }>(),
        db.prepare("SELECT count(*) AS total FROM bb_ncaa_player_season WHERE season=?").bind(season).first<{ total: number }>(),
        db.prepare("SELECT json_extract(receipt_json,'$.url') AS url, json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='ncaa_player_box' AND season=?").bind(season).first(),
        gameDb.prepare(validationSql).bind(season).first(),
      ]), DB_TIMEOUT_MS);
      const sourceRow = source as { url?: unknown; fetched_at?: unknown; sha256?: unknown } | undefined;
      const validationRow = validation as Record<string, unknown> | undefined;
      const seasons = [...new Set([
        ...gameSeasons.results.map((row) => Number((row as { season: number }).season)),
        ...seasonSeasons.results.map((row) => Number((row as { season: number }).season)),
      ])].sort((a, b) => b - a);
      const response = c.json({
        seasons,
        total: Number((gameCount?.total || seasonCount?.total || 0)),
        source: {
          url: typeof sourceRow?.url === "string" ? sourceRow.url : null,
          fetched_at: typeof sourceRow?.fetched_at === "string" ? sourceRow.fetched_at : null,
          sha256: typeof sourceRow?.sha256 === "string" ? sourceRow.sha256 : null,
        },
        validation: parseValidation(validationRow),
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The NCAA player archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  try {
    const allSeasons = season === "all";
    const rawCount = archive === "auto"
      ? await withTimeout(gameDb.prepare(`SELECT count(*) AS total FROM bb_ncaa_player_box${allSeasons ? "" : " WHERE season=?"}`).bind(...(allSeasons ? [] : [season])).first<{ total: number }>(), DB_TIMEOUT_MS)
      : null;
    const archiveMode = archive === "games" || (archive === "auto" && Number(rawCount?.total || 0) > 0) ? "games" : "season";
    const table = archiveMode === "games" ? "bb_ncaa_player_box" : "bb_ncaa_player_season";
    const clauses = allSeasons ? [] : ["season=?"];
    const binds: Array<string | number> = allSeasons ? [] : [season];
    if (q) {
      clauses.push(archiveMode === "games"
        ? "(player_name LIKE ? OR team_name LIKE ? OR opponent_name LIKE ? OR player_id LIKE ? OR team_id LIKE ?)"
        : "(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ? OR team_id LIKE ?)");
      const search = `%${q}%`;
      binds.push(...(archiveMode === "games" ? [search, search, search, search, search] : [search, search, search, search]));
    }
    const where = clauses.length ? clauses.join(" AND ") : "1=1";
    const queryDb = archiveMode === "games" ? gameDb : db;
    const count = await withTimeout(queryDb.prepare(`SELECT count(*) AS total FROM ${table} WHERE ${where}`).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
    const rows = await withTimeout(queryDb.prepare(
      archiveMode === "games"
          ? `SELECT season,contest_id,team_id,player_id,game_date,team_name,opponent_name,player_name,stats_json
           FROM bb_ncaa_player_box WHERE ${where}
           ORDER BY season DESC, game_date DESC, player_name ASC, contest_id ASC LIMIT 50 OFFSET ?`
        : `SELECT season,NULL AS contest_id,team_id,player_id,NULL AS game_date,team_name,NULL AS opponent_name,player_name,stats_json
           FROM bb_ncaa_player_season WHERE ${where}
           ORDER BY season DESC, player_name ASC, team_name ASC, player_id ASC LIMIT 50 OFFSET ?`,
    ).bind(...binds, page * 50).all(), DB_TIMEOUT_MS);
    const response = c.json({
      season, archive_mode: archiveMode,
      page,
      page_size: 50,
      total: Number(count?.total || 0),
      rows: rows.results.map(({ stats_json, ...row }) => {
        let stats: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(String(stats_json));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stats = parsed as Record<string, unknown>;
        } catch {
          // Integrity metadata reports malformed payloads; withhold only this row's stats.
        }
        return { ...row, stats };
      }),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The NCAA player archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
