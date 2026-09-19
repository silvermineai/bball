import { describe, expect, it, vi } from "vitest";
import { ncaaPlayerRankings } from "../src/ncaa-player-rankings";

describe("NCAA player rankings availability", () => {
  it("returns a retryable status when the rankings catalog is unavailable", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await ncaaPlayerRankings.request(
      "/?meta=1&season=2026",
      {},
      { DB: { prepare, batch: vi.fn() } } as never,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The NCAA player rankings catalog is temporarily unavailable.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the published leaderboard snapshot when D1 is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      generated_at: "2026-09-17T10:00:00Z",
      players: [
        {
          player_id: 7,
          team_ncaa_id: 42,
          division: 1,
          name: "Example Guard",
          team_name: "Example U",
          class_year: "Jr.",
          position: "G",
          games: 20,
          mins: 600,
          pts: 400,
          ppg: 20,
          rpg: 4,
          apg: 5,
          spg: 2,
          bpg: 0.2,
          pf: 30,
          tov: 40,
          fga: 300,
          fgm: 150,
          tpa: 120,
          tpm: 48,
          fta: 80,
          ftm: 72,
          orb: 20,
          drb: 60,
          o_poss: 400,
          fg_pct: 50,
          three_pct: 40,
          ft_pct: 90,
          mpg: 30,
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ppg&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; total: number; rows: Array<Record<string, unknown>> };
    expect(body.source).toBe("published_fallback");
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({
      season: 2026,
      player_id: "7",
      team_id: "42",
      player_name: "Example Guard",
      team_name: "Example U",
      value: 20,
      rank: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
