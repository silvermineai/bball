import { Hono } from "hono";
export const careers = new Hono<{ Bindings: Env }>();

/** Stream the exact historical player-box release whose receipt is active in D1. */
careers.get("/source", async (c) => {
  const value = c.req.query("season");
  if (value === undefined || !/^\d{4}$/.test(value) || +value < 2003 || +value > 2026)
    return c.json({ error: "Invalid historical source season" }, 400);
  const season = +value;
  const row = await c.env.DB.prepare(
    "SELECT receipt_json FROM bb_career_seasons WHERE season=?",
  ).bind(season).first<{ receipt_json: string }>();
  let source: { sha256?: unknown } | null = null;
  try {
    const receipts = row?.receipt_json ? JSON.parse(row.receipt_json) : [];
    source = Array.isArray(receipts)
      ? receipts.find((item) => item && item.dataset === "player_box" && item.season === season) || null
      : null;
  } catch {
    return c.json({ error: "Historical source receipt is invalid" }, 503);
  }
  const digest = typeof source?.sha256 === "string" ? source.sha256 : "";
  if (!/^[a-f0-9]{64}$/.test(digest))
    return c.json({ error: "Historical player-box source release not found" }, 404);
  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="player_box_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`))
    return new Response(null, { status: 304, headers });
  const object = await c.env.RESEARCH_ARCHIVE.get(`basketball/careers/player-box/${season}/${digest}.parquet`);
  if (!object || !("body" in object))
    return c.json({ error: "Historical player-box source release is temporarily unavailable" }, 503);
  return new Response(object.body, { headers });
});

careers.get("/:id", async (c) => {
  const id = c.req.param("id"),
    value = c.req.query("season");
  if (
    !/^[1-9]\d{0,14}$/.test(id) ||
    (value !== undefined &&
      (!/^\d{4}$/.test(value) || +value < 2003 || +value > 2026))
  )
    return c.json({ error: "Invalid player or historical season" }, 400);
  const profiles = await c.env.DB.prepare(
    `SELECT p.season,p.payload_json,s.edition
    FROM bb_career_profiles p JOIN bb_career_seasons s ON s.season=p.season AND s.edition=p.edition
    WHERE p.athlete_id=? ORDER BY p.season DESC`,
  )
    .bind(id)
    .all<{ season: number; payload_json: string; edition: string }>();
  if (!profiles.results.length)
    return c.json({ error: "No historical box-score identity found" }, 404);
  const season = value === undefined ? profiles.results[0].season : +value;
  const source = await c.env.DB.prepare(
    "SELECT edition,receipt_json,coverage_json FROM bb_career_seasons WHERE season=?",
  )
    .bind(season)
    .first<{ edition: string; receipt_json: string; coverage_json: string }>();
  if (!source)
    return c.json(
      { error: "This historical season has not been imported" },
      404,
    );
  // Pin the selected logs to the same edition as the first profile read, even during activation.
  const selected = profiles.results.find((p) => p.season === season);
  if (selected && selected.edition !== source.edition)
    return c.json(
      { error: "A new historical edition is activating. Please reload." },
      503,
    );
  const logs = await c.env.DB.prepare(
    "SELECT payload_json FROM bb_career_logs WHERE edition=? AND season=? AND athlete_id=? ORDER BY part",
  )
    .bind(source.edition, season, id)
    .all<{ payload_json: string }>();
  const core = await c.env.DB.prepare(
    "SELECT season,profile_json FROM bb_player_core WHERE athlete_id=? ORDER BY season DESC",
  )
    .bind(id)
    .all<{ season: number; profile_json: string }>();
  const parsedProfiles = profiles.results.map((p) => ({
    ...JSON.parse(p.payload_json),
    edition: p.edition,
  }));
  const names = new Set(
    parsedProfiles.map((p) =>
      String(p.name)
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, ""),
    ),
  );
  const years = profiles.results.map((p) => p.season);
  const identityReviewRequired =
    names.size > 1 || Math.max(...years) - Math.min(...years) > 8;
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    id,
    season,
    edition: source.edition,
    profiles: parsedProfiles,
    identity_review_required: identityReviewRequired,
    rows: logs.results.flatMap((r) => JSON.parse(r.payload_json)),
    sources: JSON.parse(source.receipt_json),
    coverage: JSON.parse(source.coverage_json),
    core: core.results
      .filter(({ profile_json }) => typeof profile_json === "string")
      .map(({ season, profile_json }) => ({
        season,
        profile: JSON.parse(profile_json),
      })),
  });
});
