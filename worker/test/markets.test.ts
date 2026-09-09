import { describe, expect, it, vi } from "vitest";
import { markets } from "../src/markets";

describe("market archive metadata", () => {
  it("reports only connectors applicable to the selected sport", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 0, pregame: 0 }] },
    ]);
    const response = await markets.request(
      "/?meta=1&sport=basketball",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      provider_capabilities: Array<{ provider: string; markets: string[]; provider_update_clock: boolean }>;
    };
    expect(body.provider_capabilities).toEqual([
      expect.objectContaining({ provider: "The Odds API", markets: ["h2h", "spreads", "totals"], provider_update_clock: true }),
      expect.objectContaining({ provider: "CollegeBasketballData.com API", markets: ["h2h"], provider_update_clock: false }),
    ]);
  });

  it("keeps football market reads on the research ledger", async () => {
    const legacyPrepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const legacyBatch = vi.fn();
    const researchPrepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const researchBatch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 12, pregame: 12 }] },
    ]);
    const response = await markets.request(
      "/?meta=1&sport=football",
      {},
      {
        DB: { prepare: legacyPrepare, batch: legacyBatch },
        RESEARCH_DB: { prepare: researchPrepare, batch: researchBatch },
      },
    );
    expect(response.status).toBe(200);
    expect(researchBatch).toHaveBeenCalled();
    expect(legacyBatch).not.toHaveBeenCalled();
  });
});
