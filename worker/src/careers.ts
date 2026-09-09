import { researchDb } from "./research-db";
import { Hono } from "hono";
export const careers = new Hono<{ Bindings: Env }>();

type CareerCoverage = Record<string, unknown>;

type CareerHistoryIndex = {
  seasons?: Array<{
    season?: unknown;
    edition?: unknown;
    field_coverage?: unknown;
  }>;
};

/** Expose archive coverage metadata without returning the player warehouse. */
careers.get("/meta", async (c) => {
  const result = await researchDb(c.env).prepare(
    "SELECT season,edition,coverage_json,receipt_json FROM bb_career_seasons ORDER BY season DESC",
  ).all<{ season: number; edition: string; coverage_json: string; receipt_json: string }>();
  const seasons = result.results.map((row) => {
    let coverage: Record<string, unknown> = {};
    let receipts: unknown[] = [];
    try {
      const parsed = JSON.parse(row.coverage_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) coverage = parsed as Record<string, unknown>;
    } catch {
      // Keep the season visible while marking malformed coverage as absent.
    }
    try {
      const parsed = JSON.parse(row.receipt_json);
      if (Array.isArray(parsed)) receipts = parsed;
    } catch {
      // Receipt details are optional metadata for this bounded endpoint.
    }
    const latestReceipt = receipts
      .map((receipt) => receipt && typeof receipt === "object" ? (receipt as Record<string, unknown>) : null)
      .filter((receipt): receipt is Record<string, unknown> => !!receipt)
      .map((receipt) => typeof receipt.fetched_at === "string" ? receipt.fetched_at : null)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) || null;
    return {
      season: row.season,
      edition: row.edition,
      identified_rows: typeof coverage.identified_rows === "number" ? coverage.identified_rows : null,
      player_team_entries: typeof coverage.player_team_entries === "number" ? coverage.player_team_entries : null,
      appearance_games: typeof coverage.appearance_games === "number" ? coverage.appearance_games : null,
      completed_schedule_games: typeof coverage.completed_schedule_games === "number" ? coverage.completed_schedule_games : null,
      missing_identity: typeof coverage.missing_identity === "number" ? coverage.missing_identity : null,
      latest_receipt: latestReceipt,
    };
  });
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ seasons, latest_receipt: seasons.map((row) => row.latest_receipt).filter((value): value is string => value !== null).sort().at(-1) || null });
});

/**
 * The D1 season row is the release authority. The static history index carries
 * the field-level audit added after the initial warehouse import, so only
 * merge it when both artifacts name the same immutable edition.
 */
async function matchingFieldCoverage(
  c: { env: Env; req: { url: string } },
  season: number,
  edition: string,
): Promise<CareerCoverage | null> {
  try {
    const response = await c.env.ASSETS?.fetch(
      new Request(new URL("/data/basketball/history/index.json", c.req.url)),
    );
    if (!response?.ok) return null;
    const index = (await response.json()) as CareerHistoryIndex;
    const record = index.seasons?.find((entry) => Number(entry.season) === season);
    if (record?.edition !== edition || !record.field_coverage || typeof record.field_coverage !== "object") {
      return null;
    }
    return record.field_coverage as CareerCoverage;
  } catch {
    return null;
  }
}

/** Stream the exact historical player-box release whose receipt is active in D1. */
careers.get("/source", async (c) => {
  const value = c.req.query("season");
  if (value === undefined || !/^\d{4}$/.test(value) || +value < 2003 || +value > 2026)
    return c.json({ error: "Invalid historical source season" }, 400);
  const season = +value;
  const row = await researchDb(c.env).prepare(
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
  const profiles = await researchDb(c.env).prepare(
    `SELECT p.season,p.payload_json,s.edition
    FROM bb_career_profiles p JOIN bb_career_seasons s ON s.season=p.season AND s.edition=p.edition
    WHERE p.athlete_id=? ORDER BY p.season DESC`,
  )
    .bind(id)
    .all<{ season: number; payload_json: string; edition: string }>();
  if (!profiles.results.length)
    return c.json({ error: "No historical box-score identity found" }, 404);
  const season = value === undefined ? profiles.results[0].season : +value;
  const source = await researchDb(c.env).prepare(
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
  const logs = await researchDb(c.env).prepare(
    "SELECT payload_json FROM bb_career_logs WHERE edition=? AND season=? AND athlete_id=? ORDER BY part",
  )
    .bind(source.edition, season, id)
    .all<{ payload_json: string }>();
  const core = await researchDb(c.env).prepare(
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
  let coverage: CareerCoverage;
  try {
    const parsed = JSON.parse(source.coverage_json) as unknown;
    coverage = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as CareerCoverage
      : {};
  } catch {
    return c.json({ error: "Historical coverage is invalid" }, 503);
  }
  const fieldCoverage = await matchingFieldCoverage(c, season, source.edition);
  if (fieldCoverage) coverage = { ...coverage, field_coverage: fieldCoverage };
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    id,
    season,
    edition: source.edition,
    profiles: parsedProfiles,
    identity_review_required: identityReviewRequired,
    rows: logs.results.flatMap((r) => JSON.parse(r.payload_json)),
    sources: JSON.parse(source.receipt_json),
    coverage,
    core: core.results
      .filter(({ profile_json }) => typeof profile_json === "string")
      .map(({ season, profile_json }) => ({
        season,
        profile: JSON.parse(profile_json),
      })),
  });
});
