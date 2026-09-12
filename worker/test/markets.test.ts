import { describe, expect, it, vi } from "vitest";
import { markets } from "../src/markets";

describe("market archive metadata", () => {
  it("reports only connectors applicable to the selected sport", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 0, pregame: 0 }] },
      { results: [] },
    ]);
    const response = await markets.request(
      "/?meta=1&sport=basketball",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      provider_capabilities: Array<{ provider: string; markets: string[]; provider_update_clock: boolean }>;
      archive_receipts: Array<{ dataset: string; season: number; url: string; sha256: string }>;
    };
    expect(body.provider_capabilities).toEqual([
      expect.objectContaining({ provider: "The Odds API", markets: ["h2h", "spreads", "totals"], provider_update_clock: true }),
      expect.objectContaining({ provider: "CollegeBasketballData.com API", markets: ["h2h"], provider_update_clock: false }),
      expect.objectContaining({ provider: "ESPN Summary", markets: ["h2h", "spreads", "totals"], provider_update_clock: false }),
    ]);
    expect(body.archive_receipts).toEqual([]);
  });

  it("returns retained football betting release receipts", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 12, pregame: 0 }] },
      { results: [{ dataset: "betting", season: 2025, receipt_json: JSON.stringify({
        url: "https://example.com/betting.csv",
        fetched_at: "2026-09-12T00:00:00Z",
        sha256: "a".repeat(64),
        attribution: { name: "SportsDataverse", license: "CC BY 4.0" },
      }) }] },
    ]);
    const response = await markets.request("/?meta=1&sport=football", {}, { DB: { prepare: vi.fn(), batch } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ archive_receipts: [
      expect.objectContaining({ dataset: "betting", season: 2025, url: "https://example.com/betting.csv", sha256: "a".repeat(64), attribution: { name: "SportsDataverse", license: "CC BY 4.0" } }),
    ] });
  });

  it("keeps football market reads on the football archive", async () => {
    const legacyPrepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const legacyBatch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 12, pregame: 12 }] },
    ]);
    const researchPrepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const researchBatch = vi.fn();
    const response = await markets.request(
      "/?meta=1&sport=football",
      {},
      {
        DB: { prepare: legacyPrepare, batch: legacyBatch },
        RESEARCH_DB: { prepare: researchPrepare, batch: researchBatch },
      },
    );
    expect(response.status).toBe(200);
    expect(legacyBatch).toHaveBeenCalled();
    expect(researchBatch).not.toHaveBeenCalled();
  });

  it("returns an explicit unavailable state when the archive warehouse is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await markets.request(
      "/?meta=1&sport=basketball",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      sport: "basketball",
      total: 0,
      source: "unavailable",
      unavailable_reason: expect.stringContaining("did not respond"),
    }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("supports a bounded all-season archive read", async () => {
    const first = vi.fn().mockResolvedValue({ total: 2 });
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bound = { first, all };
    const prepare = vi.fn(() => ({ bind: vi.fn(() => bound) }));
    const response = await markets.request(
      "/?sport=football&season=all&page=0",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ season: "all", total: 2, rows: [] });
    const calls = prepare.mock.calls as unknown as Array<[string]>;
    expect(calls[0]?.[0] || "").toContain("WHERE 1=1");
    expect(calls[0]?.[0] || "").not.toContain("g.season=?");
  });
});
