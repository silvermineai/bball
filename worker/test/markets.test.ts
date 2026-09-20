import { describe, expect, it, vi } from "vitest";
import { markets } from "../src/markets";

describe("market archive metadata", () => {
  it("reports only connectors applicable to the selected sport", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 0, pregame: 0 }] },
      { results: [] },
      { results: [{ payload_json: JSON.stringify({ provider: "ESPN Summary", sport: "basketball", season: 2027, summary_count: 20, summary_with_pickcenter: 0 }), captured_at: "2026-09-15T18:00:00Z" }] },
    ]);
    const response = await markets.request(
      "/?meta=1&sport=basketball&publication_check=unit",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      provider_capabilities: Array<{ provider: string; markets: string[]; provider_update_clock: boolean }>;
      archive_receipts: Array<{ dataset: string; season: number; url: string; sha256: string }>;
      research_capture?: { summary_count?: number; summary_with_pickcenter?: number };
    };
    expect(body.provider_capabilities).toEqual([
      expect.objectContaining({ markets: ["h2h", "spreads", "totals"], provider_update_clock: true }),
      expect.objectContaining({ markets: ["h2h"], provider_update_clock: false }),
      expect.objectContaining({ markets: ["h2h", "spreads", "totals"], provider_update_clock: false }),
    ]);
    expect(body.archive_receipts).toEqual([]);
    expect(body.research_capture).toEqual({ captured_at: "2026-09-15T18:00:00Z", season: 2027, summary_count: 20, summary_with_pickcenter: 0, market_status: "no_quotes_published" });
  });

  it("surfaces the authorized basketball lines capture diagnostics", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 4, pregame: 4 }] },
      { results: [{ receipts: 3, latest_captured_at: "2026-09-15T18:00:00Z" }] },
      { results: [{ payload_json: JSON.stringify({
        provider: "CollegeBasketballData.com API",
        sport: "basketball",
        season: 2027,
        source_rows: 12,
        rows_with_lines: 4,
        accepted_markets: 4,
        rejected_records: 1,
      }), captured_at: "2026-09-15T18:00:00Z" }] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      research_capture: {
        season: 2027,
        source_rows: 12,
        rows_with_lines: 4,
        accepted_markets: 4,
        rejected_records: 1,
        market_status: "validated_quotes",
      },
    });
    expect(JSON.stringify(body)).not.toContain("CollegeBasketballData.com");
  });

  it("does not label postgame ledger observations as pregame coverage", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 4, pregame: 1 }] },
      { results: [{ receipts: 1, latest_captured_at: "2026-09-15T18:00:00Z" }] },
      { results: [] },
    ]);
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare, batch } });
    await expect(response.json()).resolves.toMatchObject({ total: 4, pregame: 1 });
    expect((prepare.mock.calls as unknown as Array<[unknown]>).map(([sql]) => String(sql)).join("\n")).toContain("json_extract(m.payload_json,'$.starts_at')");
  });

  it("derives each retained ledger row's pregame flag from its capture clock", async () => {
    const prepare = vi.fn((sql: string) => {
      const bound = {
        first: vi.fn().mockResolvedValue(sql.includes("count(*)") ? { total: 2 } : null),
        all: vi.fn().mockResolvedValue({ results: [
          {
            game_id: "game-before-tip",
            season: 2027,
            kickoff: "2027-01-02T20:00:00Z",
            home_name: "Home University",
            away_name: "Away University",
            home_spread: -2.5,
            total: null,
            home_price: 1.9,
            away_price: 1.9,
            over_price: null,
            under_price: null,
            observed_at: "2027-01-02T18:00:00Z",
            updated_at: "2027-01-02T18:01:00Z",
            source: "licensed-feed",
            is_pregame: 1,
            market: "spreads",
            bookmaker: "book",
            provider: "licensed-feed",
          },
          {
            game_id: "game-after-tip",
            season: 2027,
            kickoff: "2027-01-02T20:00:00Z",
            home_name: "Home University",
            away_name: "Away University",
            home_spread: -2.5,
            total: null,
            home_price: 1.9,
            away_price: 1.9,
            over_price: null,
            under_price: null,
            observed_at: "2027-01-02T21:00:00Z",
            updated_at: "2027-01-02T21:01:00Z",
            source: "licensed-feed",
            is_pregame: 0,
            market: "spreads",
            bookmaker: "book",
            provider: "licensed-feed",
          },
        ] }),
      };
      return { bind: vi.fn(() => bound) };
    });
    const response = await markets.request(
      "/?sport=basketball&season=2027&page=0&publication_check=row-clock",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { rows: Array<{ game_id: string; is_pregame: number }> };
    expect(body.rows.map((row) => [row.game_id, row.is_pregame])).toEqual([
      ["game-before-tip", 1],
      ["game-after-tip", 0],
    ]);
    const sql = (prepare.mock.calls as unknown as Array<[string]>).map(([statement]) => statement).join("\n");
    expect(sql).toContain("CASE WHEN datetime(m.captured_at) < datetime(g.starts_at) THEN 1 ELSE 0 END AS is_pregame");
  });

  it("classifies quote validation outcomes from the capture receipt", async () => {
    const makeResponse = async (capture: Record<string, number>) => {
      const batch = vi.fn().mockResolvedValue([
        { results: [] },
        { results: [{ total: 0, pregame: 0 }] },
        { results: [] },
        { results: [{ payload_json: JSON.stringify({ provider: "ESPN Summary", sport: "basketball", ...capture }), captured_at: "2026-09-15T18:00:00Z" }] },
      ]);
      return markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    };

    const rejected = await makeResponse({ summary_count: 3, summary_with_pickcenter: 2, accepted_markets: 0, rejected_records: 2 });
    await expect(rejected.json()).resolves.toMatchObject({ research_capture: { market_status: "quotes_failed_validation" } });

    const accepted = await makeResponse({ summary_count: 3, summary_with_pickcenter: 2, accepted_markets: 4, rejected_records: 0 });
    await expect(accepted.json()).resolves.toMatchObject({ research_capture: { market_status: "validated_quotes" } });
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
    const response = await markets.request("/?meta=1&sport=football&publication_check=unit", {}, { DB: { prepare: vi.fn(), batch } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ archive_receipts: [
      expect.objectContaining({ dataset: "betting", season: 2025, sha256: "a".repeat(64) }),
    ] });
  });

  it("keeps connector names and archive URLs out of the public metadata", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 12, pregame: 12 }] },
      { results: [{ dataset: "betting", season: 2025, receipt_json: JSON.stringify({ url: "https://example.com/betting.csv", fetched_at: "2026-09-12T00:00:00Z", sha256: "a".repeat(64), attribution: { name: "SportsDataverse" } }) }] },
    ]);
    const response = await markets.request("/?meta=1&sport=football", {}, { DB: { prepare: vi.fn(), batch } });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("SportsDataverse");
    expect(body).not.toContain("example.com/betting.csv");
    expect(body).not.toContain("The Odds API");
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
    // The split research binding is probed for current ESPN Summary captures;
    // the legacy archive remains the fallback when that binding is absent.
    expect(researchBatch).toHaveBeenCalled();
  });

  it("keeps answered archive metadata when the secondary binding is busy", async () => {
    const legacyBatch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 12, pregame: 12 }] },
      { results: [] },
    ]);
    const researchBatch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await markets.request(
      "/?meta=1&sport=football",
      {},
      {
        DB: { prepare: vi.fn(), batch: legacyBatch },
        RESEARCH_DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch: researchBatch },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 12,
      pregame: 12,
      seasons: [2025],
      source: "partial",
      unavailable_sources: ["research"],
    });
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
