import { describe, expect, it, vi } from "vitest";
import { ncaaPlayerComparison } from "../src/ncaa-player-comparison";

describe("NCAA exact-ID player comparison", () => {
  it("returns one same-season cohort with shared receipts and missing IDs", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => ({ sql, args }),
    }));
    const batch = vi.fn(async (statements: Array<{ sql: string; args: unknown[] }>) => {
      expect(statements[0].args).toEqual([2026, "11", "22", "33"]);
      expect(statements[1].args).toEqual([2026, "11", "22", "33"]);
      return [
        { results: [
          { season: 2026, player_id: "11", team_id: "7", player_name: "Alpha", team_name: "Example U", games: 20, stats_json: JSON.stringify({ pts: 300, o_poss: 400 }) },
          { season: 2026, player_id: "22", team_id: "8", player_name: "Beta", team_name: "Sample State", games: 18, stats_json: JSON.stringify({ pts: 210, o_poss: null }) },
        ] },
        { results: [
          { season: 2026, player_id: "11", team_id: "7", team_name: "Example U", player_name: "Alpha", profile_json: JSON.stringify({ class: "Jr.", position: "G" }) },
        ] },
        { results: [
          { dataset: "ncaa_player_box", season: 2026, receipt_json: JSON.stringify({ url: "https://example.test/player-box.parquet", fetched_at: "2026-09-19T00:00:00Z", sha256: "a".repeat(64) }) },
        ] },
      ];
    });
    const response = await ncaaPlayerComparison.request(
      "/?season=2026&ids=11,22,33",
      {},
      { DB: { prepare, batch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      season: 2026,
      requested_ids: ["11", "22", "33"],
      missing_ids: ["33"],
      cards: [
        { player_id: "11", seasons: [{ team_id: "7", stats: { pts: 300, o_poss: 400 } }], rosters: [{ profile: { class: "Jr.", position: "G" } }] },
        { player_id: "22", seasons: [{ team_id: "8", stats: { pts: 210, o_poss: null } }], rosters: [] },
      ],
      source_receipts: [{ dataset: "ncaa_player_box", season: 2026, sha256: "a".repeat(64) }],
    });
  });

  it("rejects malformed or oversized ID cohorts before reading D1", async () => {
    const prepare = vi.fn();
    for (const path of ["/?season=2026&ids=11,bad", "/?season=2026&ids=1,2,3,4", "/?season=2009&ids=11"]) {
      expect((await ncaaPlayerComparison.request(path, {}, { DB: { prepare } } as never)).status).toBe(400);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("fails closed when the comparison warehouse is unavailable", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await ncaaPlayerComparison.request(
      "/?season=2026&ids=11",
      {},
      { DB: { prepare: vi.fn(() => ({ bind: vi.fn() })), batch } } as never,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "The NCAA player comparison is temporarily unavailable." });
  });
});
