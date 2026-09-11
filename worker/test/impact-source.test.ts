import { describe, expect, it, vi } from "vitest";
import { impactSource } from "../src/impact-source";

const digest = "a".repeat(64);
const catalog = JSON.stringify({ seasons: [{ season: 2011, source: { sha256: digest } }] });

function env(catalogJson = catalog) {
  const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
  const fetch = vi.fn(async () => new Response(catalogJson));
  return { DB: {}, RESEARCH_ARCHIVE: { get }, ASSETS: { fetch } };
}

describe("league NCAA RAPM source archive", () => {
  it("streams the catalog-hashed release", async () => {
    const bindings = env();
    const response = await impactSource.request("/source?season=2011", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("ncaa_mbb_rapm_2011.parquet");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(`basketball/ncaa-rapm/2011/${digest}.parquet`);
  });

  it("returns 304 without reading R2 for the same release", async () => {
    const bindings = env();
    const response = await impactSource.request("/source?season=2011", { headers: { "If-None-Match": `"${digest}"` } }, bindings);
    expect(response.status).toBe(304);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
});
