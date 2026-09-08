import { Hono } from "hono";

export const footballPlayerHistory = new Hono<{ Bindings: Env }>();

footballPlayerHistory.get("/source", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT payload_json FROM football_artifacts WHERE name='football-player-history'",
  ).first<{ payload_json: string }>();
  if (!row?.payload_json) return c.text("Football player archive is unavailable", 503);
  let archive: { key?: unknown; sha256?: unknown } | undefined;
  try {
    const payload = JSON.parse(row.payload_json) as { archive?: { key?: unknown; sha256?: unknown } };
    archive = payload.archive;
  } catch {
    return c.text("Football player archive manifest is invalid", 503);
  }
  const key = typeof archive?.key === "string" ? archive.key : "";
  const digest = typeof archive?.sha256 === "string" ? archive.sha256 : "";
  if (!/^bball-research\/football\/player-history\/[a-f0-9]{64}\.tar$/.test(key) || !/^[a-f0-9]{64}$/.test(digest)) {
    return c.text("Football player source archive not published", 404);
  }
  const headers = new Headers({
    "Content-Type": "application/x-tar",
    "Content-Disposition": 'attachment; filename="football-player-history-sources.tar"',
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) {
    return new Response(null, { status: 304, headers });
  }
  const object = await c.env.RESEARCH_ARCHIVE.get(key);
  if (!object || !("body" in object)) return c.text("Football player source archive is temporarily unavailable", 503);
  return new Response(object.body, { headers });
});
