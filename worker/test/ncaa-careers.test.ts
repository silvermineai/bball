import { describe, expect, it, vi } from "vitest";
import { ncaaCareers } from "../src/ncaa-careers";

describe("NCAA historical leaderboard availability", () => {
  it("returns a retryable status when the catalog is unavailable", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await ncaaCareers.request(
      "/?meta=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The NCAA historical leaderboard catalog is temporarily unavailable.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps source receipts on a filtered historical board", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: async () => ({ total: 1 }),
        all: async () => ({
          results: sql.includes("bb_sources")
            ? [{ dataset: "ncaa_player_box", season: 2026, receipt_json: JSON.stringify({ url: "https://source.test/box", fetched_at: "2026-09-01T00:00:00Z", sha256: "a".repeat(64) }) }]
            : [{ season: 2026, player_id: "42", team_id: "7", player_name: "Example", team_name: "Example U", games: 30, minutes: 900, points: 600, rebounds: 150, value: 20, rank: 1 }],
        }),
      })),
    }));
    const response = await ncaaCareers.request(
      "/?fromSeason=2026&toSeason=2026&metric=ppg",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      source_receipts: [{ dataset: "ncaa_player_box", sha256: "a".repeat(64) }],
      rows: [{ player_id: "42", value: 20 }],
    });
  });
});
