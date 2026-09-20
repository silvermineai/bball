import { researchDb } from "./research-db";
import { Hono } from "hono";
export const recruiting = new Hono<{ Bindings: Env }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("recruiting edition database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type RecruitingRelease = Record<string, unknown>;

function publicRelease(value: unknown, season: number, firstRecordedAt: string): RecruitingRelease {
  const release = value && typeof value === "object" && !Array.isArray(value)
    ? value as RecruitingRelease
    : {};
  const { sources: rawSources, stats_source: _statsSource, ...safe } = release;
  const programs = Array.isArray(safe.programs)
    ? safe.programs.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const program = value as Record<string, unknown>;
      const id = program.id == null ? null : String(program.id);
      const name = typeof program.name === "string" && program.name.trim() ? program.name.trim() : null;
      return id && name ? [{ id, name }] : [];
    })
    : [];
  const edition = typeof safe.edition === "string" && /^[a-f0-9]{64}$/i.test(safe.edition)
    ? safe.edition.toLowerCase()
    : null;
  const coverage = safe.coverage && typeof safe.coverage === "object" && !Array.isArray(safe.coverage)
    ? safe.coverage as Record<string, unknown>
    : {};
  const sourceCount = Number.isSafeInteger(coverage.sources) && Number(coverage.sources) >= 0
    ? Number(coverage.sources)
    : null;
  // Keep the activity timeline resolvable without republishing provider URLs
  // or names. The client only needs the retained source ID, publication and
  // review clocks, title and source digest to explain the evidence row.
  const sources = Array.isArray(rawSources)
    ? rawSources.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const source = value as Record<string, unknown>;
      const id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : null;
      const teamId = source.team_id == null ? null : String(source.team_id);
      const publishedOn = typeof source.published_on === "string" ? source.published_on : null;
      const checkedAt = typeof source.checked_at === "string" ? source.checked_at : null;
      if (!id || !teamId || !publishedOn || !checkedAt) return [];
      return [{
        id,
        team_id: teamId,
        url: "",
        title: typeof source.title === "string" ? source.title : "",
        publisher: "",
        published_on: publishedOn,
        date_basis: typeof source.date_basis === "string" ? source.date_basis : "",
        checked_at: checkedAt,
        review_note: typeof source.review_note === "string" ? source.review_note : null,
        source_sha256: typeof source.source_sha256 === "string" && /^[a-f0-9]{64}$/i.test(source.source_sha256) ? source.source_sha256.toLowerCase() : null,
      }];
    })
    : [];
  return {
    ...safe,
    first_recorded_at: firstRecordedAt,
    programs,
    sources,
    source_receipt: {
      dataset: "basketball_recruiting",
      season,
      captured_at: firstRecordedAt,
      source_rows: sourceCount,
      sha256: edition,
      sha256_scope: edition ? "release_edition" : "unavailable",
      integrity: edition && sourceCount != null && sourceCount > 0 ? "verified" : "unavailable",
    },
  };
}

recruiting.get("/", async (c) => {
  const value = c.req.query("season") ?? "2027";
  if (!/^\d{4}$/.test(value) || +value < 2025 || +value > 2035)
    return c.json({ error: "Invalid recruiting season" }, 400);
  const cache = typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the recruiting edition fail.
    }
  }
  try {
    const row = await withTimeout(researchDb(c.env).prepare(
      `SELECT r.payload_json,r.first_recorded_at
      FROM bb_recruiting_releases r JOIN bb_recruiting_current a ON a.edition=r.edition AND a.season=r.season
      WHERE a.season=?`,
    )
      .bind(+value)
      .first<{ payload_json: string; first_recorded_at: string }>(), DB_TIMEOUT_MS);
    if (!row)
      return c.json(
        { error: "No reviewed recruiting edition for this season" },
        404,
      );
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      return c.json({ error: "The reviewed recruiting edition is malformed." }, 503, { "Cache-Control": "no-store" });
    }
    const response = c.json(publicRelease(payload, +value, row.first_recorded_at));
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The reviewed recruiting edition is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
