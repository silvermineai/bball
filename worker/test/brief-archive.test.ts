import { describe, expect, it, vi } from "vitest";
import {
  archiveObject,
  briefArchive,
  retiredBrief,
} from "../src/brief-archive";
import app from "../src/index";
const digest = "a".repeat(64);
const row = {
  bundle_key: `brief-archive/${"b".repeat(64)}.pack`,
  byte_offset: 10,
  byte_length: 40,
  raw_size: 100,
  content_type: "text/html",
};
function binding(value: unknown = row) {
  const first = vi.fn().mockResolvedValue(value);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind, first });
  return { first, bind, prepare };
}
describe("retained matchup reading views", () => {
  it("validates archive identifiers and filters before storage access", async () => {
    for (const path of [
      "/archive/brief-objects/not-a-hash",
      `/archive/briefs/other/1/${digest}`,
      `/archive/briefs/football/../${digest}`,
      "/api/research/briefs?page=-1",
      "/api/research/briefs?sport=nba",
      "/api/research/briefs?asof=1.2",
    ]) {
      const response = await briefArchive.request(path, {}, {});
      expect([400, 404]).toContain(response.status);
    }
  });
  it("reads only the registered R2 range, decompresses it and serves immutable safe headers", async () => {
    const db = binding();
    const get = vi.fn().mockResolvedValue({
      body: new Response("<h1>Frozen score</h1>").body!.pipeThrough(
        new CompressionStream("gzip"),
      ),
    });
    const env = { DB: db, RESEARCH_ARCHIVE: { get } } as unknown as Env;
    const response = await archiveObject(
      env,
      digest,
      new Request("https://example.test/a"),
    );
    expect(await response.text()).toBe("<h1>Frozen score</h1>");
    expect(get).toHaveBeenCalledWith(row.bundle_key, {
      range: { offset: 10, length: 40 },
    });
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    get.mockClear();
    const cached = await archiveObject(
      env,
      digest,
      new Request("https://example.test/a", {
        headers: { "If-None-Match": `"${digest}"` },
      }),
    );
    expect(cached.status).toBe(304);
    expect(get).not.toHaveBeenCalled();
    const weakCached = await archiveObject(
      env,
      digest,
      new Request("https://example.test/a", {
        headers: { "If-None-Match": `W/"${digest}"` },
      }),
    );
    expect(weakCached.status).toBe(304);
    expect(get).not.toHaveBeenCalled();
  });
  it("does not expose arbitrary bucket keys or cache missing content", async () => {
    const get = vi.fn().mockResolvedValue(null);
    for (const value of [
      null,
      { ...row, bundle_key: "private/research.csv" },
    ]) {
      const response = await archiveObject(
        { DB: binding(value), RESEARCH_ARCHIVE: { get } } as unknown as Env,
        digest,
        new Request("https://example.test/a"),
      );
      expect([404, 503]).toContain(response.status);
      expect(get).not.toHaveBeenCalled();
    }
    const response = await archiveObject(
      { DB: binding(), RESEARCH_ARCHIVE: { get } } as unknown as Env,
      digest,
      new Request("https://example.test/a"),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects unsafe or overflowing R2 ranges", async () => {
    const get = vi.fn();
    for (const value of [
      { ...row, byte_offset: Number.MAX_SAFE_INTEGER + 1 },
      { ...row, byte_length: Number.MAX_SAFE_INTEGER, byte_offset: 1 },
      { ...row, raw_size: 0 },
    ]) {
      const response = await archiveObject(
        { DB: binding(value), RESEARCH_ARCHIVE: { get } } as unknown as Env,
        digest,
        new Request("https://example.test/a"),
      );
      expect(response.status).toBe(503);
    }
    expect(get).not.toHaveBeenCalled();
  });
  it("preserves live pages and redirects retired URLs only when a retained game exists", async () => {
    const db = binding({ revision: digest });
    const env = {
      DB: db,
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(new Response("gone", { status: 404 })),
      },
    };
    for (const path of ["/blog/game-123/", "/basketball/briefs/123/"]) {
      const response = await app.request(path, {}, env);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain(digest);
    }
    db.first.mockClear();
    env.ASSETS.fetch.mockResolvedValue(new Response("current"));
    expect(await (await app.request("/blog/game-123/", {}, env)).text()).toBe(
      "current",
    );
    expect(db.first).not.toHaveBeenCalled();
    const original = new Response("missing", { status: 404 });
    expect(
      await retiredBrief(
        { DB: binding(null) } as unknown as Env,
        new Request("https://example.test/blog/game-123/"),
        "football",
        "123",
        original,
      ),
    ).toBe(original);
  });
  it("pins pagination to an upper sequence and binds literal search values", async () => {
    const db = binding({ sequence: 12 });
    const batch = vi
      .fn()
      .mockResolvedValue([
        { results: [{ total: 30 }] },
        { results: [{ revision: digest }] },
      ]);
    const response = await briefArchive.request(
      "/api/research/briefs?sport=football&q=%25_&asof=10&page=1",
      {},
      { DB: { ...db, batch } },
    );
    expect(await response.json()).toMatchObject({
      asof: 10,
      page: 1,
      total: 30,
    });
    expect(db.bind).toHaveBeenCalledWith(
      10,
      "football",
      "football",
      null,
      null,
      "latest",
      "%_",
      24,
    );
    expect(
      db.prepare.mock.calls.some(([sql]) => sql.includes("sequence<=?")),
    ).toBe(true);
  });
});
