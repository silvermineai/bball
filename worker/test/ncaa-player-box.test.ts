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
});
