import { Hono } from "hono";
export const recruiting = new Hono<{ Bindings: Env }>();
recruiting.get("/", async (c) => {
  const value = c.req.query("season") ?? "2027";
  if (!/^\d{4}$/.test(value) || +value < 2025 || +value > 2035)
    return c.json({ error: "Invalid recruiting season" }, 400);
  const row = await c.env.DB.prepare(
    `SELECT r.payload_json,r.first_recorded_at
    FROM bb_recruiting_releases r JOIN bb_recruiting_current a ON a.edition=r.edition AND a.season=r.season
    WHERE a.season=?`,
  )
    .bind(+value)
    .first<{ payload_json: string; first_recorded_at: string }>();
  if (!row)
    return c.json(
      { error: "No reviewed recruiting edition for this season" },
      404,
    );
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    ...JSON.parse(row.payload_json),
    first_recorded_at: row.first_recorded_at,
  });
});
