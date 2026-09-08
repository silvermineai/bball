import { describe, expect, it, vi } from "vitest";
import { footballPlayerHistory } from "../src/football-player-history";

const digest = "b".repeat(64);
const key = `bball-research/football/player-history/${digest}.tar`;

function bindings(payload = JSON.stringify({ archive: { key, sha256: digest } })) {
  const prepare = vi.fn(() => ({ first: async () => ({ payload_json: payload }) }));
  const get = vi.fn(async () => ({ body: new Response("TAR").body }));
  return { DB: { prepare }, RESEARCH_ARCHIVE: { get } };
}

describe("football player source archive", () => {
  it("streams the content-addressed R2 archive", async () => {
    const env = bindings();
    const response = await footballPlayerHistory.request("/source", {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-tar");
    expect(response.headers.get("content-disposition")).toContain("football-player-history-sources.tar");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(await response.text()).toBe("TAR");
    expect(env.RESEARCH_ARCHIVE.get).toHaveBeenCalledWith(key.slice("bball-research/".length));
  });

  it("rejects malformed manifest pointers before reading R2", async () => {
    const env = bindings(JSON.stringify({ archive: { key: "bad", sha256: "bad" } }));
    const response = await footballPlayerHistory.request("/source", {}, env);
    expect(response.status).toBe(404);
    expect(env.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });

  it("returns 304 for a matching archive hash", async () => {
    const env = bindings();
    const response = await footballPlayerHistory.request("/source", { headers: { "If-None-Match": `"${digest}"` } }, env);
    expect(response.status).toBe(304);
    expect(env.RESEARCH_ARCHIVE.get).not.toHaveBeenCalled();
  });
});
