import { describe, expect, it, vi } from "vitest";
import { scheduleTimes } from "../src/schedule-times";

describe("basketball schedule clock observations", () => {
  it("reports confirmed and observed counts from the latest row per game", async () => {
    const first = vi.fn().mockResolvedValue({ total: 4, confirmed: 2, latest_observed_at: "2026-09-12T00:00:00Z" });
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ first })) }));
    const response = await scheduleTimes.request(
      "/?season=2027&meta=1",
      {},
      { RESEARCH_DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ season: 2027, total: 4, confirmed: 2, latest_observed_at: "2026-09-12T00:00:00Z", provider: "ESPN Scoreboard" });
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

  it("honors the bounded page limit and strips the stored payload", async () => {
    const first = vi.fn().mockResolvedValue({ total: 1, confirmed_count: 1 });
    const all = vi.fn().mockResolvedValue({ results: [{
      game_id: "401900001",
      season: 2027,
      home_name: "Home",
      away_name: "Away",
      canonical_start: "2026-11-10T02:00:00Z",
      canonical_time_tbd: 1,
      source_start: "2026-11-10T02:00:00.000000Z",
      source_time_valid: 0,
      observed_at: "2026-09-12T00:00:00.000000Z",
      provider: "ESPN Scoreboard",
      payload_json: JSON.stringify({ source_url: "https://example.test" }),
    }] });
    const bind = vi.fn(() => ({ first, all }));
    const prepare = vi.fn(() => ({ bind }));
    const response = await scheduleTimes.request(
      "/?season=2027&limit=200&page=0",
      {},
      { RESEARCH_DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { rows: Array<Record<string, unknown>>; page_size: number; confirmed_count: number };
    expect(body.page_size).toBe(200);
    expect(body.confirmed_count).toBe(1);
    expect(body.rows[0]).toMatchObject({ game_id: "401900001", source_time_valid: false, source_url: "https://example.test" });
    expect(body.rows[0]).not.toHaveProperty("payload_json");
    expect(bind).toHaveBeenCalledWith(2027, 200, 0);
  });
});
