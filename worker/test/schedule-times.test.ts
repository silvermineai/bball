import { describe, expect, it, vi } from "vitest";
import { scheduleTimes } from "../src/schedule-times";

describe("basketball schedule clock observations", () => {
  it("reports confirmed and observed counts from the latest row per game", async () => {
    const first = vi.fn().mockResolvedValue({ total: 4, confirmed: 2 });
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ first })) }));
    const response = await scheduleTimes.request(
      "/?season=2027&meta=1",
      {},
      { RESEARCH_DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ season: 2027, total: 4, confirmed: 2, provider: "ESPN Scoreboard" });
    expect(String((prepare.mock.calls as unknown as Array<[string]>)[0]?.[0])).toContain("ROW_NUMBER");
  });

  it("returns a bounded unavailable state when D1 is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await scheduleTimes.request(
      "/?season=2027&confirmed=1",
      {},
      { RESEARCH_DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 0,
      rows: [],
      source: "unavailable",
      unavailable_reason: expect.stringContaining("warehouse"),
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
