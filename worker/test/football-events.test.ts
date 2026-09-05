import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { footballEvents } from "../src/football-events";
const edition = "football-events-" + "a".repeat(20);
function database() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => {
      calls.push({ sql, values });
      return {
        first: async () =>
          sql.includes("football_event_editions")
            ? {
                edition,
                generated_at: "2026-09-05",
                receipt_json: '{"sources":[]}',
                coverage_json: '{"records":2}',
              }
            : { total: 2 },
        all: async () => ({
          results: [
            {
              payload_json:
                '{"record_key":"1","identity_status":"name_only","metrics":{"sacks":null}}',
            },
          ],
        }),
      };
    },
  }));
  return { DB: { prepare }, calls };
}
describe("football name-attributed events", () => {
  it("serves the browser URL through the complete router and preserves query filters on slash redirects", async () => {
    const env = database();
    const response = await app.request(
      "/api/football/events?dataset=defense&sort=sacks",
      {},
      env,
    );
    expect(response.status).toBe(200);
    const slash = await app.request(
      "/api/football/events/?dataset=specialists&season=2026",
      {},
      env,
    );
    expect(slash.status).toBe(308);
    expect(slash.headers.get("location")).toBe(
      "/api/football/events?dataset=specialists&season=2026",
    );
  });
  it("rejects unsafe and incompatible filters before database access", async () => {
    for (const q of [
      "dataset=passing",
      "season=2025.5",
      "page=-1",
      "team=1%20OR%201=1",
      "game=abc",
      "edition=latest",
      "sort=sacks%27)%3BDROP",
      "dataset=specialists&sort=sacks",
      "positive=1",
      "q=" + "x".repeat(101),
      "direction=sideways",
    ])
      expect((await footballEvents.request("/?" + q)).status).toBe(400);
  });
  it("pins all result queries to an immutable edition and binds literal search text", async () => {
    const env = database();
    const response = await footballEvents.request(
      "/?dataset=defense&season=2025&team=2&game=3&q=%25_%27&sort=sacks&positive=1&page=2",
      {},
      env,
    );
    expect(response.status).toBe(200);
    const data = await response.json<{
      rows: { metrics: { sacks: number | null }; identity_status: string }[];
    }>();
    expect(data.rows[0].metrics.sacks).toBeNull();
    expect(data.rows[0].identity_status).toBe("name_only");
    expect(env.calls[1].values).toEqual([edition, "2", "3", "%_'"]);
    expect(env.calls[2].values).toEqual([edition, "2", "3", "%_'", 80]);
    expect(env.calls[2].sql).toContain("LIMIT 40 OFFSET ?");
    expect(env.calls[2].sql).toContain("$.metrics.sacks");
    expect(env.calls[2].sql).toContain("IS NULL");
    expect(env.calls[2].sql).not.toContain("%_'");
  });
  it("serves explicit retained editions instead of silently substituting active data", async () => {
    const env = database();
    await footballEvents.request("/?edition=" + edition, {}, env);
    expect(env.calls[0].values).toEqual(["defense", 2025, edition]);
    expect(env.calls[0].sql).not.toContain("JOIN football_event_active");
  });
  it("reports an unavailable edition rather than an empty population", async () => {
    const response = await footballEvents.request(
      "/",
      {},
      {
        DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
      },
    );
    expect(response.status).toBe(404);
  });
});
