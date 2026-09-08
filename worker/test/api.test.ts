import { describe, expect, it, vi } from "vitest";
import app from "../src/index";

describe("bball api", () => {
  it("serves health without a database binding", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("serves native basketball pages while preserving known archive routes", async () => {
    const fetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/basketball/" || path === "/basketball/players/" || path === "/basketball/film/") {
        return new Response("native page");
      }
      if (path === "/basketball-shell/") return new Response("archive shell");
      return new Response("not found", { status: 404 });
    });
    const env = { ASSETS: { fetch } };
    for (const path of ["/basketball/", "/basketball/players/", "/basketball/film/"]) {
      const response = await app.request(path, {}, env);
      expect(await response.text()).toBe("native page");
    }
    const archive = await app.request("/basketball/scout/333", {}, env);
    expect(await archive.text()).toBe("archive shell");
    for (const path of [
      "/basketball/unknown",
      "/basketball/scout/missing.js",
    ]) {
      const response = await app.request(path, {}, env);
      expect(response.status).toBe(404);
    }
  });

  it("keeps legacy team IDs and query strings in redirects", async () => {
    const response = await app.request("/scout/333?season=2026");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/basketball/scout/333?season=2026",
    );
    const film = await app.request("/film/");
    expect(film.status).toBe(302);
    expect(film.headers.get("location")).toBe("/basketball/film/");
    const conferences = await app.request("/conferences/");
    expect(conferences.status).toBe(302);
    expect(conferences.headers.get("location")).toBe("/basketball/conferences/");
  });

  it("rejects invalid basketball player parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/players/invalid",
      "/api/basketball/research/players/123?page=-1",
      "/api/basketball/research/players/123?season=2020",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid NCAA leaderboard parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-leaders?division=4",
      "/api/basketball/research/ncaa-leaders?stat=per",
      "/api/basketball/research/ncaa-leaders?page=-1",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects unknown publisher stat fields before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/publisher-stats?stat=not-a-source-field",
      "/api/basketball/research/publisher-stats?category=totals&stat=avgPoints",
      "/api/basketball/research/publisher-stats?page=-1",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid team and boutique source parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/team-stats?category=made-up&stat=avgPoints",
      "/api/basketball/research/team-stats?stat=avgPoints&page=-1",
      "/api/basketball/research/boutique?kind=other",
      "/api/basketball/research/boutique?kind=ratings&metric=not_a_metric",
      "/api/basketball/research/boutique?season=2000",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid lineup metrics before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/lineups?season=2024",
      "/api/basketball/research/lineups?metric=made_up",
      "/api/basketball/research/lineups?minPoss=-1",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid player profile archive parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/player-core?season=2002",
      "/api/basketball/research/player-core?season=2027",
      "/api/basketball/research/player-core?page=-1",
      "/api/basketball/research/player-core?position=%27%20OR%201%3D1%20--",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid market archive parameters before querying D1", async () => {
    for (const path of [
      "/api/research/markets?season=2020",
      "/api/research/markets?page=-1",
      "/api/research/markets?page=1.5",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("validates research history identifiers and pagination before database access", async () => {
    for (const path of [
      "/api/research/games/nba/123",
      "/api/research/games/football/not-an-id",
      "/api/research/games/basketball/123?kind=secrets",
      "/api/research/games/football/123?page=-1",
      "/api/research/games/football/123?page=1.5",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });
});
