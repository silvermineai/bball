import { describe, expect, it, vi } from "vitest";
import { ncaaGameContext } from "../src/ncaa-game-context";

function bindings(view = "rosters") {
  const prepare = vi.fn((sql: string) => ({
    all: async () => ({ results: [{ season: 2026 }] }),
    bind: vi.fn(() => ({
      first: async () => sql.includes("count(*)") ? { total: 2 } : { season: 2026, dataset: `ncaa_${view === "rosters" ? "game_rosters" : "officials"}`, sha256: "a".repeat(64) },
      all: async () => ({ results: sql.includes("DISTINCT") ? [{ season: 2026 }] : [{ season: 2026, game_id: "401", team_id: "7", athlete_id: "42", athlete_name: "Example Guard", team_name: "Example U", starter: 1, active: 1, raw_json: JSON.stringify({ athlete_display_name: "Example Guard" }) }] }),
    })),
  }));
  return { NCAA_BOX_DB: { prepare }, RESEARCH_DB: { prepare } } as never;
}

describe("NCAA game context archive", () => {
  it("returns bounded roster rows and source metadata", async () => {
    const response = await ncaaGameContext.request("/?season=2026&view=rosters", {}, bindings());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      view: "rosters",
      total: 2,
      rows: [{ athlete_name: "Example Guard", raw: { athlete_display_name: "Example Guard" } }],
    });
  });

  it("supports officials metadata without touching roster columns", async () => {
    const response = await ncaaGameContext.request("/?season=2026&view=officials&meta=1", {}, bindings("officials"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ view: "officials", seasons: [2026], total: 2 });
  });
});
