import { describe, expect, it, vi } from "vitest";
import { matchupStintSource } from "../src/matchup-stint-source";

const digest = "d".repeat(64);
const catalog = JSON.stringify({ seasons: [{ season: 2026, source: { sha256: digest } }] });

function env(catalogJson = catalog) {
  const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
  const fetch = vi.fn(async () => new Response(catalogJson));
  return { DB: {}, RESEARCH_ARCHIVE: { get }, ASSETS: { fetch } };
}

describe("matchup-stint source archive", () => {
  it("streams the catalog-hashed release", async () => {
    const bindings = env();
    const response = await matchupStintSource.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("ncaa_mbb_matchup_stints_2026.parquet");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(`basketball/matchup-stints/2026/${digest}.parquet`);
  });
  it("returns 304 without reading R2 for the same release", async () => {
    const bindings = env();
    const response = await matchupStintSource.request("/source?season=2026", { headers: { "If-None-Match": `"${digest}"` } }, bindings);
    expect(response.status).toBe(304);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
  it("rejects an invalid release hash", async () => {
    const bindings = env(JSON.stringify({ seasons: [{ season: 2026, source: { sha256: "bad" } }] }));
    const response = await matchupStintSource.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(404);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
});
