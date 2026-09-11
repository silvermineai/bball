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
});
