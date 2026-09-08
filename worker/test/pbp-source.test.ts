import { describe, expect, it, vi } from "vitest";
import { pbpSource } from "../src/pbp-source";

const digest = "b".repeat(64);
const catalog = JSON.stringify({ seasons: [{ season: 2026, source: { sha256: digest } }] });

function env(catalogJson = catalog) {
  const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
  const fetch = vi.fn(async () => new Response(catalogJson));
  return { DB: {}, RESEARCH_ARCHIVE: { get }, ASSETS: { fetch } };
}

describe("PBP source archive", () => {
  it("streams the catalog-hashed release from R2", async () => {
    const bindings = env();
    const response = await pbpSource.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.apache.parquet");
    expect(response.headers.get("content-disposition")).toContain("play_by_play_2026.parquet");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(
      `basketball/pbp/2026/${digest}.parquet`,
    );
  });

  it("does not read R2 for an invalid release hash", async () => {
    const bindings = env(JSON.stringify({ seasons: [{ season: 2026, source: { sha256: "bad" } }] }));
    const response = await pbpSource.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(404);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });

  it("returns 304 for the matching immutable hash", async () => {
    const bindings = env();
    const response = await pbpSource.request(
      "/source?season=2026",
      { headers: { "If-None-Match": `"${digest}"` } },
      bindings,
    );
    expect(response.status).toBe(304);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
});
