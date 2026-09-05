import { Hono } from "hono";

type Profile = { id: string; games: { id: string }[]; [key: string]: unknown };
type Shot = {
  id: string;
  team: string;
  player: string | null;
  [key: string]: unknown;
};
export const shooting = new Hono<{ Bindings: Env }>();

shooting.get("/:kind/:id", async (c) => {
  const { kind, id } = c.req.param();
  const seasonText = c.req.query("season") ?? "2026";
  if (
    !["team", "player"].includes(kind) ||
    !/^\d{1,15}$/.test(id) ||
    !/^\d{4}$/.test(seasonText) ||
    +seasonText < 2024 ||
    +seasonText > 2035
  ) {
    return c.json({ error: "Invalid shooting profile parameters" }, 400);
  }
  const season = +seasonText;
  const row = await c.env.DB.prepare(
    `SELECT p.payload_json,s.edition,s.receipt_json
    FROM bb_shot_profiles p JOIN bb_shot_sources s ON s.season=p.season AND s.edition=p.edition
    WHERE p.season=? AND p.kind=? AND p.entity_id=?`,
  )
    .bind(season, kind, id)
    .first<{ payload_json: string; edition: string; receipt_json: string }>();
  if (!row)
    return c.json({ error: "No shooting evidence for this selection" }, 404);
  const profile = JSON.parse(row.payload_json) as Profile;
  const games = [...new Set(profile.games.map((g) => g.id))];
  // Bound SQL parameters and return every recorded game, including multi-team players.
  const chunks = [];
  for (let i = 0; i < games.length; i += 40) {
    const ids = games.slice(i, i + 40);
    chunks.push(
      c.env.DB.prepare(
        `SELECT game_id,payload_json FROM bb_shot_games WHERE edition=? AND season=? AND game_id IN (${ids.map(() => "?").join(",")}) ORDER BY game_id,part`,
      ).bind(row.edition, season, ...ids),
    );
  }
  const results = chunks.length
    ? await c.env.DB.batch<{ game_id: string; payload_json: string }>(chunks)
    : [];
  const shots = results.flatMap((result) =>
    result.results.flatMap((game) =>
      (JSON.parse(game.payload_json) as Shot[])
        .filter((s) => (kind === "team" ? s.team : s.player) === id)
        .map((s) => ({ ...s, game: game.game_id })),
    ),
  );
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    profile,
    shots,
    source: JSON.parse(row.receipt_json),
    edition: row.edition,
  });
});
