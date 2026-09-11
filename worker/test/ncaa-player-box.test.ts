import { describe, expect, it, vi } from "vitest";
import { ncaaPlayerBox } from "../src/ncaa-player-box";

const digest = "a".repeat(64);
const catalog = JSON.stringify({ seasons: [{ season: 2026, sha256: digest }] });

function env(catalogJson = catalog) {
  const prepare = vi.fn(() => ({
    bind: vi.fn(() => ({ first: async () => ({ receipt_json: "unused" }) })),
  }));
  const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
  const fetch = vi.fn(async () => new Response(catalogJson));
  return { DB: { prepare }, RESEARCH_ARCHIVE: { get }, ASSETS: { fetch } };
}

describe("NCAA player source archive", () => {
  it("streams the hashed season parquet with immutable source headers", async () => {
    const bindings = env();
    const response = await ncaaPlayerBox.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.apache.parquet");
    expect(response.headers.get("content-disposition")).toContain("ncaa_mbb_player_box_2026.parquet");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(
      `basketball/ncaa-player-box/2026/${digest}.parquet`,
    );
    expect(bindings.ASSETS.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed source catalogs before reading R2", async () => {
    const bindings = env(JSON.stringify({ seasons: [{ season: 2026, sha256: "bad" }] }));
    const response = await ncaaPlayerBox.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(404);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });

  it("returns 304 for a matching source hash", async () => {
    const bindings = env();
    const response = await ncaaPlayerBox.request(
      "/source?season=2026",
      { headers: { "If-None-Match": `"${digest}"` } },
      bindings,
    );
    expect(response.status).toBe(304);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });

  it("reads game metadata from the dedicated archive database", async () => {
    const researchPrepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: async () => sql.includes("receipt_json")
          ? { url: "https://example.test/player-box.parquet", fetched_at: "2026-09-08T02:12:45Z", sha256: digest }
          : { total: 3 },
        all: async () => ({ results: [{ season: 2026 }] }),
      })),
      all: async () => ({ results: [{ season: 2026 }] }),
    }));
    const gamePrepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: async () => sql.includes("total_rows")
          ? { total_rows: 7, missing_ids: 0 }
          : { total: 7 },
      })),
      all: async () => ({ results: [{ season: 2026 }] }),
    }));
    const response = await ncaaPlayerBox.request(
      "/?meta=1&season=2026",
      {},
      {
        DB: { prepare: researchPrepare },
        NCAA_BOX_DB: { prepare: gamePrepare },
      } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [2026],
      total: 7,
      source: { url: "https://example.test/player-box.parquet", sha256: digest },
      validation: { total_rows: 7 },
    });
    expect(gamePrepare).toHaveBeenCalled();
    expect(researchPrepare).toHaveBeenCalled();
  });

  it("allows an explicit season-total view when game rows also exist", async () => {
    const researchPrepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: async () => ({ total: 1 }),
        all: async () => sql.includes("bb_ncaa_player_season")
          ? { results: [{ season: 2025, contest_id: null, team_id: "7", player_id: "42", game_date: null, team_name: "Example U", opponent_name: null, player_name: "Example Veteran", stats_json: JSON.stringify({ mins: 900, pts: 400 }) }] }
          : { results: [] },
      })),
    }));
    const gamePrepare = vi.fn();
    const response = await ncaaPlayerBox.request(
      "/?season=2025&archive=season",
      {},
      { DB: { prepare: researchPrepare }, NCAA_BOX_DB: { prepare: gamePrepare } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      archive_mode: "season",
      total: 1,
      rows: [{ player_id: "42", stats: { mins: 900, pts: 400 } }],
    });
    expect(gamePrepare).not.toHaveBeenCalled();
    expect(researchPrepare.mock.calls.some(([sql]) => String(sql).includes("FROM bb_ncaa_player_season"))).toBe(true);
  });

  it("returns a bounded retryable error when the archive read does not settle", async () => {
    vi.useFakeTimers();
    try {
      const prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: () => new Promise(() => undefined) })),
      }));
      const request = ncaaPlayerBox.request(
        "/?season=2025&archive=season",
        {},
        { DB: { prepare }, NCAA_BOX_DB: { prepare } } as never,
      );
      await vi.advanceTimersByTimeAsync(5000);
      const response = await request;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "The NCAA player archive is temporarily unavailable." });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      vi.useRealTimers();
    }
  });
});
