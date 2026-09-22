import { researchDb } from "./research-db";
import { Hono } from "hono";

/**
 * Coverage-only view of operator-imported recruiting evidence. The licensed
 * row payload stays in D1; this endpoint publishes counts and clocks, not a
 * public mirror of a provider export.
 */
export const recruitingIntake = new Hono<{ Bindings: Env }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("recruiting intake database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const providerCapabilities = [
  {
    provider: "CollegeBasketballData.com API",
    kinds: ["portal", "players", "teams"],
    season_field: "year",
    event_date_available: false,
    docs_url: "https://api.collegebasketballdata.com/api/recruiting",
    policy: "Season-level provider records stay separate from dated school announcements.",
  },
];

recruitingIntake.get("/", async (c) => {
  const value = c.req.query("season") ?? "2027";
  if (!/^\d{4}$/.test(value) || +value < 2025 || +value > 2035)
    return c.json({ error: "Invalid recruiting intake season" }, 400);
  const season = +value;
  const cache = typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the coverage endpoint fail.
    }
  }
  try {
    const [summary, providers, statuses, providerFeeds, publicRankings] = await withTimeout(Promise.all([
      researchDb(c.env).prepare(
        `SELECT count(*) AS total, max(captured_at) AS latest_captured_at
         FROM bb_recruiting_intake WHERE season=?`,
      ).bind(season).first<{ total: number; latest_captured_at: string | null }>(),
      researchDb(c.env).prepare(
        `SELECT provider, count(*) AS rows, max(captured_at) AS latest_captured_at
         FROM bb_recruiting_intake WHERE season=? GROUP BY provider ORDER BY latest_captured_at DESC, provider`,
      ).bind(season).all<{ provider: string; rows: number; latest_captured_at: string | null }>(),
      researchDb(c.env).prepare(
        `SELECT status, count(*) AS rows FROM bb_recruiting_intake
         WHERE season=? GROUP BY status ORDER BY status`,
      ).bind(season).all<{ status: string; rows: number }>(),
      researchDb(c.env).prepare(
        `SELECT provider, kind, count(*) AS rows, max(captured_at) AS latest_captured_at
         FROM bb_cbbd_recruiting WHERE season=?
         GROUP BY provider, kind ORDER BY latest_captured_at DESC, provider, kind`,
      ).bind(season).all<{ provider: string; kind: string; rows: number; latest_captured_at: string | null }>(),
      researchDb(c.env).prepare(
        `SELECT c.edition, c.captured_at AS latest_captured_at,
                count(r.athlete_id) AS rows,
                sum(CASE WHEN r.rank IS NOT NULL THEN 1 ELSE 0 END) AS ranked_rows,
                sum(CASE WHEN r.committed_team_id IS NOT NULL THEN 1 ELSE 0 END) AS committed_rows,
                sum(CASE
                  WHEN typeof(r.source_sha256) <> 'text'
                    OR length(trim(r.source_sha256)) <> 64
                    OR lower(trim(r.source_sha256)) GLOB '*[^0-9a-f]*'
                  THEN 1 ELSE 0 END) AS invalid_source_hashes
           FROM bb_espn_recruiting_current c
           LEFT JOIN bb_espn_recruiting r
             ON r.season=c.season AND r.edition=c.edition
          WHERE c.season=?
          GROUP BY c.edition, c.captured_at`,
      ).bind(season).first<{
        edition: string | null;
        latest_captured_at: string | null;
        rows: number;
        ranked_rows: number | null;
        committed_rows: number | null;
        invalid_source_hashes: number | null;
      }>(),
    ]), DB_TIMEOUT_MS);
    const publicProviders = providers.results.map((provider) => ({ ...provider, provider: "Authorized feed" }));
    const publicProviderFeeds = providerFeeds.results.map((feed) => ({ ...feed, provider: "Authorized feed" }));
    const publicCapabilities = providerCapabilities.map(({ provider: _provider, docs_url: _docsUrl, policy: _policy, ...capability }) => capability);
    // The generic intake table and licensed provider feeds are stored in
    // separate tables.  Report their combined row count so a populated
    // provider feed cannot be mistaken for an empty transfer archive.
    const providerFeedRows = providerFeeds.results.reduce((sum, feed) => {
      const rows = Number(feed.rows);
      return Number.isSafeInteger(rows) && rows >= 0 ? sum + rows : sum;
    }, 0);
    const authorizedRows = Number(summary?.total || 0) + providerFeedRows;
    const publicRankingEdition = typeof publicRankings?.edition === "string" && /^[a-f0-9]{64}$/i.test(publicRankings.edition)
      ? publicRankings.edition.toLowerCase()
      : null;
    const publicRankingRows = Number(publicRankings?.rows || 0);
    const publicRankingInvalidHashes = Number(publicRankings?.invalid_source_hashes || 0);
    const publicRankingReceiptVerified = publicRankingEdition !== null
      && Number.isSafeInteger(publicRankingRows)
      && publicRankingRows > 0
      && Number.isSafeInteger(publicRankingInvalidHashes)
      && publicRankingInvalidHashes === 0;
    const response = c.json({
      season,
      total: summary?.total ?? 0,
      authorized_rows: authorizedRows,
      intake_status: authorizedRows > 0 ? "rows_available" : "confirmed_empty",
      latest_captured_at: summary?.latest_captured_at ?? null,
      providers: publicProviders,
      statuses: statuses.results,
      provider_feeds: publicProviderFeeds,
      provider_capabilities: publicCapabilities,
      public_rankings: {
        rows: publicRankingRows,
        ranked_rows: Number(publicRankings?.ranked_rows || 0),
        committed_rows: Number(publicRankings?.committed_rows || 0),
        edition: publicRankings?.edition || null,
        latest_captured_at: publicRankings?.latest_captured_at || null,
        source_receipt: {
          dataset: "recruiting_rankings",
          captured_at: publicRankings?.latest_captured_at || null,
          source_rows: publicRankingRows,
          sha256: publicRankingReceiptVerified ? publicRankingEdition : null,
          sha256_scope: publicRankingReceiptVerified ? "release_edition" : "unavailable",
          integrity: publicRankingReceiptVerified ? "verified" : "unavailable",
        },
        policy: "Public prospect rankings are separate from authorized transfer, eligibility and portal intake; they do not establish roster status or eligibility.",
      },
      policy: "Coverage metadata only. A zero authorized-intake count means no licensed transfer/eligibility export is loaded; the separate public prospect board is reported above when available. Source-reported rows remain in the authorized D1 intake and are not republished as a provider-feed mirror.",
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({
      season,
      total: 0,
      authorized_rows: null,
      intake_status: "unavailable",
      latest_captured_at: null,
      providers: [],
      statuses: [],
      provider_feeds: [],
      provider_capabilities: providerCapabilities.map(({ provider: _provider, docs_url: _docsUrl, policy: _policy, ...capability }) => capability),
      public_rankings: {
        rows: 0,
        ranked_rows: 0,
        committed_rows: 0,
        edition: null,
        latest_captured_at: null,
        source_receipt: {
          dataset: "recruiting_rankings",
          captured_at: null,
          source_rows: 0,
          sha256: null,
          sha256_scope: "unavailable",
          integrity: "unavailable",
        },
        policy: "Public prospect ranking coverage is unavailable while the warehouse is unavailable.",
      },
      source: "unavailable",
      unavailable_reason: "The recruiting coverage warehouse did not respond within the read window.",
      policy: "Coverage metadata only. The warehouse response did not establish whether authorized intake or public prospect rows exist.",
    }, 200, { "Cache-Control": "no-store" });
  }
});
