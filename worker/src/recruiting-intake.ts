import { Hono } from "hono";

/**
 * Coverage-only view of operator-imported recruiting evidence. The licensed
 * row payload stays in D1; this endpoint publishes counts and clocks, not a
 * public mirror of a provider export.
 */
export const recruitingIntake = new Hono<{ Bindings: Env }>();

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
  const [summary, providers, statuses, providerFeeds] = await Promise.all([
    c.env.DB.prepare(
      `SELECT count(*) AS total, max(captured_at) AS latest_captured_at
       FROM bb_recruiting_intake WHERE season=?`,
    ).bind(season).first<{ total: number; latest_captured_at: string | null }>(),
    c.env.DB.prepare(
      `SELECT provider, count(*) AS rows, max(captured_at) AS latest_captured_at
       FROM bb_recruiting_intake WHERE season=? GROUP BY provider ORDER BY latest_captured_at DESC, provider`,
    ).bind(season).all<{ provider: string; rows: number; latest_captured_at: string | null }>(),
    c.env.DB.prepare(
      `SELECT status, count(*) AS rows FROM bb_recruiting_intake
       WHERE season=? GROUP BY status ORDER BY status`,
    ).bind(season).all<{ status: string; rows: number }>(),
    c.env.DB.prepare(
      `SELECT provider, kind, count(*) AS rows, max(captured_at) AS latest_captured_at
       FROM bb_cbbd_recruiting WHERE season=?
       GROUP BY provider, kind ORDER BY latest_captured_at DESC, provider, kind`,
    ).bind(season).all<{ provider: string; kind: string; rows: number; latest_captured_at: string | null }>(),
  ]);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    total: summary?.total ?? 0,
    latest_captured_at: summary?.latest_captured_at ?? null,
    providers: providers.results,
    statuses: statuses.results,
    provider_feeds: providerFeeds.results,
    provider_capabilities: providerCapabilities,
    policy: "Coverage metadata only. Source-reported rows remain in the authorized D1 intake and are not republished as a provider-feed mirror.",
  });
});
