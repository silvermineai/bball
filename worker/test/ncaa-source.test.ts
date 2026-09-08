import { describe, expect, it, vi } from "vitest";
import { ncaaRosters } from "../src/ncaa-rosters";
import { ncaaShooting } from "../src/ncaa-shooting";

const digest = "a".repeat(64);

function env(dataset: string, season: number, receipt = JSON.stringify({ sha256: digest })) {
  const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
  const first = vi.fn(async () => ({ receipt_json: receipt }));
  const prepare = vi.fn((sql: string) => ({ bind: vi.fn((...args: unknown[]) => ({ first: sql.includes("bb_sources") && args[0] === dataset && args[1] === season ? first : first })) }));
  return { DB: { prepare }, RESEARCH_ARCHIVE: { get }, ASSETS: { fetch: vi.fn() } };
}

describe("NCAA roster and shooting source archives", () => {
  it("streams an exact roster release and honors validators", async () => {
    const bindings = env("ncaa_team_rosters", 2026);
    const response = await ncaaRosters.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("ncaa_mbb_team_rosters_2026.parquet");
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(`basketball/ncaa-rosters/2026/${digest}.parquet`);
  });

  it("streams an exact shot release", async () => {
    const bindings = env("ncaa_shots", 2026);
    const response = await ncaaShooting.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("ncaa_mbb_shots_2026.parquet");
    expect(await response.text()).toBe("PARQUET");
    expect(bindings.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(`basketball/ncaa-shots/2026/${digest}.parquet`);
  });

  it("returns 304 without reading R2", async () => {
    const bindings = env("ncaa_shots", 2026);
    const response = await ncaaShooting.request("/source?season=2026", { headers: { "If-None-Match": `"${digest}"` } }, bindings);
    expect(response.status).toBe(304);
    expect(bindings.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
});
