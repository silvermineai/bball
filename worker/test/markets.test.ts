import { describe, expect, it, vi } from "vitest";
import { markets } from "../src/markets";

describe("market archive metadata", () => {
  it("reports only connectors applicable to the selected sport", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2025 }] },
      { results: [{ total: 0, pregame: 0 }] },
      { results: [] },
      { results: [{ payload_json: JSON.stringify({ provider: "ESPN Summary", sport: "basketball", season: 2027, horizon_days: 90, summary_count: 20, summary_with_pickcenter: 0 }), captured_at: "2026-09-15T18:00:00Z" }] },
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
      expect.objectContaining({ markets: ["h2h", "spreads", "totals"], provider_update_clock: true }),
    ]);
    expect(body.archive_receipts).toEqual([]);
    expect(body.research_capture).toEqual({ captured_at: "2026-09-15T18:00:00Z", season: 2027, horizon_days: 90, summary_count: 20, summary_with_pickcenter: 0, market_status: "no_quotes_published" });
  });

  it("counts only market connector receipts in capture metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 0, pregame: 0 }] },
      { results: [{ receipts: 2, latest_captured_at: "2026-09-15T18:00:00Z" }] },
      { results: [] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare, batch } });
    expect(response.status).toBe(200);
    const statements = (prepare.mock.calls as unknown as Array<[string]>).map(([sql]) => sql).join("\n");
    expect(statements).toContain("provider IN ('ESPN Summary','CollegeBasketballData.com API','The Odds API')");
    expect(statements).toContain("provider LIKE 'CSV:%'");
    await expect(response.json()).resolves.toMatchObject({ research_receipts: 2, research_latest_capture_at: "2026-09-15T18:00:00Z" });
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

  it("surfaces a validated licensed CSV capture without exposing the provider name or license URL", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 2, pregame: 2 }] },
      { results: [{ receipts: 1, latest_captured_at: "2026-09-15T18:00:00Z" }] },
      { results: [{ payload_json: JSON.stringify({
        provider: "Licensed Sportsbook Export",
        source_kind: "licensed_csv",
        sport: "basketball",
        source_rows: 1,
        rows_with_lines: 1,
        accepted_markets: 1,
        rejected_records: 0,
        license_url: "https://provider.example/terms",
      }), captured_at: "2026-09-15T18:00:00Z" }] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    const body = await response.text();
    expect(body).toContain('"market_status":"validated_quotes"');
    expect(body).not.toContain("Licensed Sportsbook Export");
    expect(body).not.toContain("provider.example/terms");
  });

  it("preserves the distinction between ESPN odds payloads and pickcenter quotes", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 0, pregame: 0 }] },
      { results: [{ receipts: 1, latest_captured_at: "2026-09-15T18:00:00Z" }] },
      { results: [{ payload_json: JSON.stringify({
        provider: "ESPN Summary",
        sport: "basketball",
        season: 2027,
        summary_count: 71,
        summary_with_pickcenter: 0,
        summary_with_odds: 0,
        accepted_markets: 0,
        rejected_records: 0,
      }), captured_at: "2026-09-15T18:00:00Z" }] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    await expect(response.json()).resolves.toMatchObject({
      research_capture: {
        summary_count: 71,
        summary_with_pickcenter: 0,
        summary_with_odds: 0,
        market_status: "no_quotes_published",
      },
    });
  });

  it("surfaces a configured Odds API capture without exposing its provider identity", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 3, pregame: 3 }] },
      { results: [{ receipts: 1, latest_captured_at: "2026-09-15T18:00:00Z" }] },
      { results: [{ payload_json: JSON.stringify({
        provider: "The Odds API",
        sport: "basketball",
        source_rows: 3,
        rows_with_lines: 2,
        accepted_markets: 6,
        rejected_records: 1,
      }), captured_at: "2026-09-15T18:00:00Z" }] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      research_capture: {
        source_rows: 3,
        rows_with_lines: 2,
        accepted_markets: 6,
        rejected_records: 1,
        market_status: "validated_quotes",
      },
    });
    expect(JSON.stringify(body)).not.toContain("The Odds API");
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

  it("fails closed when a capture receipt reports contradictory counters", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 0, pregame: 0 }] },
      { results: [] },
      { results: [{ payload_json: JSON.stringify({
        provider: "ESPN Summary",
        sport: "basketball",
        summary_count: 2,
        summary_with_pickcenter: 3,
        accepted_markets: 1,
        rejected_records: 0,
      }), captured_at: "2026-09-15T18:00:00Z" }] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    await expect(response.json()).resolves.toMatchObject({
      research_capture: {
        market_status: "unknown",
        summary_count: 2,
        summary_with_pickcenter: 3,
      },
    });
  });

  it("keeps prior validated capture evidence visible when the latest attempt has no quote", async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [] },
      { results: [{ total: 3, pregame: 3 }] },
      { results: [{ receipts: 4, latest_captured_at: "2026-09-16T18:00:00Z" }] },
      { results: [
        { payload_json: JSON.stringify({ provider: "ESPN Summary", sport: "basketball", summary_count: 20, summary_with_pickcenter: 0, accepted_markets: 0, rejected_records: 0 }), captured_at: "2026-09-16T18:00:00Z" },
        { payload_json: JSON.stringify({ provider: "CollegeBasketballData.com API", sport: "basketball", source_rows: 12, rows_with_lines: 4, accepted_markets: 3, rejected_records: 0 }), captured_at: "2026-09-15T18:00:00Z" },
      ] },
    ]);
    const response = await markets.request("/?meta=1&sport=basketball", {}, { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch } });
    await expect(response.json()).resolves.toMatchObject({
      research_capture: { market_status: "no_quotes_published", captured_at: "2026-09-16T18:00:00Z" },
      research_capture_summary: {
        attempts: 2,
        captures_with_quotes: 1,
        captures_with_validated_markets: 1,
        latest_captured_at: "2026-09-16T18:00:00Z",
        latest_validated_capture_at: "2026-09-15T18:00:00Z",
        latest_no_quote_capture_at: "2026-09-16T18:00:00Z",
      },
      research_capture_history: [
        expect.objectContaining({ captured_at: "2026-09-16T18:00:00Z", market_status: "no_quotes_published" }),
        expect.objectContaining({ captured_at: "2026-09-15T18:00:00Z", market_status: "validated_quotes", accepted_markets: 3 }),
      ],
    });
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

  it("merges the current research ledger into the all-season football archive", async () => {
    const makePrepare = (row: Record<string, unknown>) => vi.fn((sql: string) => {
      const bound = {
        first: vi.fn().mockResolvedValue(sql.includes("count(*)") ? { total: 1 } : null),
        all: vi.fn().mockResolvedValue({ results: [row] }),
      };
      return { bind: vi.fn(() => bound) };
    });
    const legacyPrepare = makePrepare({ game_id: "legacy-game", kickoff: "2025-12-01T00:00:00Z", observed_at: "2025-11-30T00:00:00Z" });
    const researchPrepare = makePrepare({ game_id: "ledger-game", kickoff: "2026-09-20T00:00:00Z", observed_at: "2026-09-19T00:00:00Z" });
    const response = await markets.request(
      "/?sport=football&season=all&page=0",
      {},
      {
        DB: { prepare: legacyPrepare },
        RESEARCH_DB: { prepare: researchPrepare },
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<{ game_id: string }> };
    expect(body.total).toBe(2);
    expect(body.rows.map((row) => row.game_id)).toEqual(["ledger-game", "legacy-game"]);
    const sql = [...legacyPrepare.mock.calls, ...researchPrepare.mock.calls]
      .map(([statement]) => statement)
      .join("\n");
    expect(sql).toContain("football_markets");
    expect(sql).toContain("audit_markets");
  });
});
