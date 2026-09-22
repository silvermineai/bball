import { describe, expect, it, vi } from "vitest";
import { ncaaShooting } from "../src/ncaa-shooting";

function bindings(stats: Record<string, unknown>) {
  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn((..._args: unknown[]) => ({
      first: async () => ({ total: sql.includes("$.zones.corner3.attempts") ? 0 : 1 }),
      all: async () => sql.includes("SELECT season,player_id")
        ? stats.zones && typeof stats.zones === "object" && "corner3" in stats.zones
          ? { results: [{ season: 2026, player_id: "100", team_id: "200", player_name: "Example Player", team_name: "Example College", stats_json: JSON.stringify(stats), value: 42.5 }] }
          : { results: [] }
        : { results: [] },
    })),
  }));
  return { DB: { prepare } };
}

describe("NCAA shooting location share rankings", () => {
  it("ranks a source-present zone share and keeps the percentage scale", async () => {
    const response = await ncaaShooting.request(
      "/?season=2026&metric=rim_share&minAttempts=50",
      {},
      bindings({
        attempts: 200,
        makes: 100,
        zones: { rim: { attempts: 80, makes: 50, points: 100 }, paint: { attempts: 40, makes: 20, points: 40 }, mid: { attempts: 30, makes: 10, points: 20 }, abovebreak3: { attempts: 30, makes: 10, points: 30 }, corner3: { attempts: 20, makes: 10, points: 30 } },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { metric: string; rows: Array<{ value: number }> };
    expect(body.metric).toBe("rim_share");
    expect(body.rows[0].value).toBe(42.5);
  });

  it("requires every three-point zone for three-point attempt share", async () => {
    const response = await ncaaShooting.request(
      "/?season=2026&metric=three_share&minAttempts=50",
      {},
      bindings({ attempts: 200, zones: { abovebreak3: { attempts: 50, makes: 20, points: 60 } } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: unknown[] };
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });
});
