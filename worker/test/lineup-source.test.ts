import { describe, expect, it, vi } from "vitest";
import { lineupSource } from "../src/lineup-source";

const digest = "f".repeat(64);

function env(receiptJson = JSON.stringify({ sha256: digest })) {
  const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
  const first = vi.fn(async () => ({ receipt_json: receiptJson }));
  return { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) })) }, RESEARCH_ARCHIVE: { get }, ASSETS: { fetch: vi.fn() } };
}

describe("lineup source archive", () => {
  it("streams the D1-receipted release", async () => {
    const bindings = env();
    const response = await lineupSource.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("ncaa_mbb_lineups_2026.parquet");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(`basketball/lineups/2026/${digest}.parquet`);
  });
  it("returns 304 without reading R2 for the same release", async () => {
    const bindings = env();
    const response = await lineupSource.request("/source?season=2026", { headers: { "If-None-Match": `"${digest}"` } }, bindings);
    expect(response.status).toBe(304);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
  it("rejects a missing or invalid receipt", async () => {
    const bindings = env(JSON.stringify({ sha256: "bad" }));
    const response = await lineupSource.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(404);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
});
