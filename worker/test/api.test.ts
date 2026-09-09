import { describe, expect, it, vi } from "vitest";
import app from "../src/index";

describe("bball api", () => {
  it("serves health without a database binding", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("returns exact-ID football season production beside the game log", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total")) {
        return { bind: () => ({ first: async () => ({ total: 3 }) }) };
      }
      if (sql.includes("SELECT s.dataset")) {
        return {
          bind: () => ({
            all: async () => ({
              results: [
                {
                  dataset: "box",
                  game_id: "401",
                  category: "rushing",
                  stats_json: JSON.stringify({
                    athlete_name: "Example Player",
                    game_id: "401",
                  }),
                  kickoff: "2025-09-01T00:00:00Z",
                  home_name: "Home",
                  away_name: "Away",
                },
              ],
            }),
          }),
        };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [
              {
                dataset: "rushing",
                category: "rushing",
                team_id: "10",
                stats_json: JSON.stringify({
                  rusher_player_name: "Example Player",
                  pos_team: "Example U",
                  division: "fbs",
                  games: "10",
                  plays: "100",
                  yards: "700",
                  yardsplay: "7.0",
                  success: "0.62",
                  rushing_td: "8",
                  TEPA: "12.5",
                  EPAplay: "0.125",
                  TEPA_rank: "42",
                }),
              },
              {
                dataset: "box",
                category: "rushing",
                team_id: "10",
                stats_json: JSON.stringify({ game_id: "401" }),
              },
            ],
          }),
        }),
      };
    });
    const response = await app.request(
      "/api/football/players/123?season=2025",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      name: string;
      summary: {
        production: Array<{ category: string; epa: number; rank: number; yards_per_play: number; success_rate: number }>;
        box_categories: Array<{ category: string; games: number }>;
      };
    };
    expect(body.name).toBe("Example Player");
    expect(body.summary.production[0]).toMatchObject({
      category: "rushing",
      epa: 12.5,
      rank: 42,
      yards_per_play: 7,
      success_rate: 0.62,
    });
    expect(body.summary.box_categories).toEqual([
      { category: "rushing", records: 1, games: 1 },
    ]);
  });

  it("returns D1 coverage counts alongside source receipt timestamps", async () => {
    const prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({
        results: [
          {
            dataset: "player_box",
            source_count: 3,
            latest_source_at: "2026-09-08T00:00:00Z",
          },
        ],
      }),
    });
    const batch = vi
      .fn()
      .mockResolvedValue([
        ...Array.from({ length: 18 }, () => ({ results: [{ rows: 7 }] })),
        { results: [{ total: 7, neutral: 2, missing_venue: 1, unconfirmed_start: 3, same_participant: 0, invalid_periods: 0, completed_missing_score: 0 }] },
        { results: [{ total: 6, paired_box_games: 5, missing_box_games: 1, negative_field_games: 0, nonpositive_possession_games: 0, invalid_period_games: 0, outlier_pace_games: 1, score_mismatch_games: 0, valid_estimate_games: 4 }] },
      ]);
    const response = await app.request(
      "/api/basketball/research/coverage",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      coverage: Array<{ dataset: string; rows: number }>;
      source_receipts: Array<{
        dataset: string;
        source_count: number;
        latest_source_at: string | null;
      }>;
    };
    expect(body.coverage).toHaveLength(18);
    expect(body.coverage[0]).toEqual({ dataset: "games", rows: 7 });
    expect(body.coverage.map((entry) => entry.dataset)).toContain("ncaa_player_box");
    expect(body.coverage.map((entry) => entry.dataset)).toContain("publisher_ratings");
    expect(body.source_receipts).toEqual([
      {
        dataset: "player_box",
        source_count: 3,
        latest_source_at: "2026-09-08T00:00:00Z",
      },
    ]);
    expect((body as typeof body & { location_validation: Record<string, number> }).location_validation).toEqual({
      total: 7,
      neutral: 2,
      missing_venue: 1,
      unconfirmed_start: 3,
      same_participant: 0,
      invalid_periods: 0,
      completed_missing_score: 0,
    });
    expect((body as typeof body & { possession_validation: Record<string, number> }).possession_validation).toEqual({
      total: 6,
      paired_box_games: 5,
      missing_box_games: 1,
      negative_field_games: 0,
      nonpositive_possession_games: 0,
      invalid_period_games: 0,
      outlier_pace_games: 1,
      score_mismatch_games: 0,
      valid_estimate_games: 4,
    });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("bb_sources"))).toBe(true);
    expect(prepare.mock.calls.some(([query]) => String(query).includes("json_extract(h.stats_json"))).toBe(true);
  });

  it("returns football D1 coverage counts and source receipt timestamps", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("football_sources")) {
        return {
          all: vi.fn().mockResolvedValue({
            results: [{ dataset: "box", source_count: 2, latest_source_at: "2026-09-08T00:00:00Z" }],
          }),
        };
      }
      return {
        all: vi.fn().mockResolvedValue({
          results: [{ dataset: "games", rows: 12 }, { dataset: "box", rows: 34 }],
        }),
      };
    });
    const response = await app.request("/api/football/coverage", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      coverage: [{ dataset: "games", rows: 12 }, { dataset: "box", rows: 34 }],
      source_receipts: [{ dataset: "box", source_count: 2, latest_source_at: "2026-09-08T00:00:00Z" }],
    });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("football_sources"))).toBe(true);
  });

  it("serves bounded unresolved source observations without attributing identities", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("count(*) AS total FROM bb_unresolved")) {
        return { bind: () => ({ first: async () => ({ total: 2 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [
              {
                dataset: "ncaa_player_box",
                season: 2026,
                row_index: 7,
                reason: "Missing contest, team or player ID",
                source_json: JSON.stringify({ contest_id: "9001", player_name: "Unresolved" }),
              },
            ],
          }),
        }),
      };
    });
    const response = await app.request(
      "/api/basketball/research/unresolved?dataset=ncaa_player_box&season=2026&q=Unresolved&limit=20",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      total: number;
      rows: Array<{ dataset: string; season: number; source: Record<string, unknown> }>;
    };
    expect(body.total).toBe(2);
    expect(body.rows[0]).toMatchObject({
      dataset: "ncaa_player_box",
      season: 2026,
      source: { contest_id: "9001", player_name: "Unresolved" },
    });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("source_json LIKE ?"))).toBe(true);
  });

  it("serves D1-backed basketball forecasts with bounded filters and parsed predictions", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 2 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [
              {
                game_id: "401902275",
                model_id: "basketball-efficiency-v1-test",
                created_at: "2026-09-08T00:00:00Z",
                prediction_json: JSON.stringify({ home_margin: 4.5, home_win_probability: 0.62 }),
                season: 2027,
                starts_at: "2026-11-02T05:00:00Z",
                home_id: "2086",
                away_id: "322",
                home_name: "Butler",
                away_name: "Lafayette",
                home_score: null,
                away_score: null,
                completed: 0,
                neutral: 0,
                time_tbd: 1,
                venue: "Hinkle Fieldhouse",
                broadcast: null,
              },
              {
                game_id: "401902276",
                model_id: "basketball-efficiency-v1-test",
                created_at: "2026-09-08T00:00:00Z",
                prediction_json: "not-json",
                season: 2027,
                starts_at: "2026-11-02T06:00:00Z",
                home_id: "12",
                away_id: "13",
                home_name: "Arizona",
                away_name: "Example",
                home_score: null,
                away_score: null,
                completed: 0,
                neutral: 0,
                time_tbd: 1,
                venue: null,
                broadcast: null,
              },
            ],
          }),
        }),
      };
    });
    const response = await app.request(
      "/api/basketball/research/forecasts?season=2027&status=upcoming&q=100%25&limit=2",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      season: number;
      status: string;
      model: string;
      page_size: number;
      total: number;
      rows: Array<{ prediction: Record<string, unknown> | null }>;
    };
    expect(body).toMatchObject({ season: 2027, status: "upcoming", model: "latest", page_size: 2, total: 2 });
    expect(body.rows[0].prediction).toEqual({ home_margin: 4.5, home_win_probability: 0.62 });
    expect(body.rows[1].prediction).toBeNull();
    expect(prepare.mock.calls.some(([query]) => String(query).includes("ESCAPE"))).toBe(true);
    expect(prepare.mock.calls.some(([query]) => String(query).includes("bb_models"))).toBe(true);
  });

  it("publishes forecast model metadata without exposing the stored coefficient artifact", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2027 }] },
      { results: [{ model_id: "basketball-efficiency-v1-test", forecasts: 12, first_created_at: "2026-09-08T00:00:00Z", last_created_at: "2026-09-08T01:00:00Z" }] },
      { results: [{
        model_id: "basketball-efficiency-v1-test",
        model_created_at: "2026-09-08T00:00:00Z",
        version: "basketball-efficiency-v1",
        target_season: 2027,
        cutoff: "2026-09-08T00:00:00Z",
        training_games: 22932,
        training_seasons: "[2023,2024,2025,2026]",
        calibration_season: 2025,
        calibration_games: 5701,
        margin_half_width: 16.08,
        evaluation_season: 2026,
        evaluation_games: 5734,
        evaluation_winner_accuracy: 0.67,
        evaluation_margin_mae: 10.38,
      }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/forecasts?meta=1&season=2027",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { models: Array<Record<string, unknown>> };
    expect(body.models[0]).toMatchObject({
      model_id: "basketball-efficiency-v1-test",
      target_season: 2027,
      training_games: 22932,
      training_seasons: [2023, 2024, 2025, 2026],
      calibration_season: 2025,
      evaluation_margin_mae: 10.38,
    });
    expect(body.models[0]).not.toHaveProperty("efficiency");
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects invalid basketball forecast filters before querying D1", async () => {
    const prepare = vi.fn();
    for (const path of [
      "/api/basketball/research/forecasts?season=2020",
      "/api/basketball/research/forecasts?status=settled",
      "/api/basketball/research/forecasts?limit=101",
      "/api/basketball/research/forecasts?model=unsafe%20model",
      "/api/basketball/research/forecasts?page=-1",
    ]) {
      expect((await app.request(path, {}, { DB: { prepare } })).status).toBe(400);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("serves the D1 publisher-news archive with parsed categories", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("count(*) AS total FROM bb_news_articles")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [{
              id: "story-1",
              publisher: "ESPN",
              sport: "mens-college-basketball",
              headline: "Transfer portal update",
              description: "A roster move.",
              published: "2026-09-08T00:00:00Z",
              link: "https://www.espn.com/mens-college-basketball/story/_/id/1",
              categories_json: JSON.stringify(["NCAA Men's Basketball"]),
              author: "Reporter",
              first_seen_at: "2026-09-08T00:00:00Z",
              last_seen_at: "2026-09-08T00:00:00Z",
            }],
          }),
        }),
      };
    });
    const batch = vi.fn().mockResolvedValue([
      { results: [{ total: 1 }] },
      { results: [{
        id: "story-1",
        publisher: "ESPN",
        sport: "mens-college-basketball",
        headline: "Transfer portal update",
        description: "A roster move.",
        published: "2026-09-08T00:00:00Z",
        link: "https://www.espn.com/mens-college-basketball/story/_/id/1",
        categories_json: JSON.stringify(["NCAA Men's Basketball"]),
        author: "Reporter",
        first_seen_at: "2026-09-08T00:00:00Z",
        last_seen_at: "2026-09-08T00:00:00Z",
      }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/news?q=portal&limit=10",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<{ categories: string[]; categories_json?: string }> };
    expect(body.total).toBe(1);
    expect(body.rows[0].categories).toEqual(["NCAA Men's Basketball"]);
    expect(body.rows[0]).not.toHaveProperty("categories_json");
    expect(prepare.mock.calls.some(([query]) => String(query).includes("ESCAPE"))).toBe(true);
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects unsafe publisher-news filters before querying D1", async () => {
    const prepare = vi.fn();
    for (const path of [
      "/api/basketball/research/news?sport=mens_college_basketball",
      "/api/basketball/research/news?limit=101",
      "/api/basketball/research/news?page=-1",
    ]) {
      expect((await app.request(path, {}, { DB: { prepare } })).status).toBe(400);
    }
    expect(prepare).not.toHaveBeenCalled();
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
      "/api/basketball/research/unresolved?dataset=not-a-dataset",
      "/api/basketball/research/unresolved?limit=101",
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

  it("labels NCAA assist leaderboard provenance without inventing a publisher rank", async () => {
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({
          results: [{
            player_id: "42",
            division: 1,
            name: "Example Player",
            team_name: "Example U",
            stat_value: 6.25,
            total_count: 1,
            ppg_rank: null,
            payload_json: JSON.stringify({ player_id: 42, apg: 6.25 }),
          }],
        }),
      })),
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-leaders?stat=apg&division=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      provenance: { kind: string; dataset: string; publisher_rank: boolean; derived_divisions: string[] };
      total: number;
      limit: number;
      pages: number;
    };
    expect(body.provenance).toMatchObject({
      kind: "exact_id_derived",
      dataset: "ncaa_mbb_player_box",
      publisher_rank: false,
      derived_divisions: ["1"],
    });
    expect(body).toMatchObject({ total: 1, limit: 40, pages: 1 });
  });

  it("returns publisher ranks from the retained source row", async () => {
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({
          results: [{
            player_id: "42",
            division: 1,
            name: "Example Player",
            team_name: "Example U",
            stat_value: 12.5,
            publisher_rank: 7,
            payload_json: JSON.stringify({
              player_id: 42,
              rpg: 12.5,
              source_stats: { rpg: { rank: 7, value: 12.5 } },
            }),
          }],
        }),
      })),
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-leaders?stat=rpg&division=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      provenance: { kind: "publisher_snapshot", publisher_rank: true },
      rows: [{ publisher_rank: 7, rpg: 12.5 }],
    });
  });

  it("rejects invalid NCAA player card IDs and seasons before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-player-card/not-an-id",
      "/api/basketball/research/ncaa-player-card/123?season=2009",
      "/api/basketball/research/ncaa-player-card/123/games?limit=501",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("serves the complete NCAA player game-log export with source fields intact", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => ({ sql, args }),
    }));
    const batch = vi.fn(async (statements: Array<{ sql: string }>) => statements.map((statement) => (
      statement.sql.includes("count(*)")
        ? { results: [{ total: 2 }] }
        : { results: [{
          season: 2026,
          contest_id: "9001",
          team_id: "77",
          game_date: "2026-01-02",
          team_name: "Example U",
          opponent_name: "Sample State",
          player_name: "Example Player",
          stats_json: JSON.stringify({ mins: 31, pts: 18, rim_pct: 0.7 }),
        }] }
    )));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-card/123/games?season=2026&limit=500",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<{ stats: Record<string, unknown> }> };
    expect(body.total).toBe(2);
    expect(body.rows[0].stats).toEqual({ mins: 31, pts: 18, rim_pct: 0.7 });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("ORDER BY game_date DESC"))).toBe(true);
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

  it("counts publisher display strings for compound source fields", async () => {
    const first = vi.fn(async () => ({ total: 12, non_null: 12 }));
    const prepare = vi.fn((sql: string) => ({
      bind: () => sql.includes("count(*) AS total")
        ? { first }
        : { all: async () => ({ results: [] }) },
    }));
    const response = await app.request(
      "/api/basketball/research/publisher-stats?season=2026&category=averages&stat=avgFieldGoalsMade-avgFieldGoalsAttempted",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 12, non_null: 12 });
    const countSql = String(prepare.mock.calls.find(([sql]) => String(sql).includes("count(*) AS total"))?.[0]);
    expect(countSql).toContain("count(json_extract(s.stats_json, ?))");
  });

  it("returns the exact publisher player-season source receipt", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => {
        if (sql.includes("count(*) AS total")) return { first: async () => ({ total: 1, non_null: 1 }) };
        if (sql.includes("FROM bb_sources")) return { all: async () => ({ results: [{ dataset: "player_season", season: 2026, receipt_json: JSON.stringify({ url: "https://example.test/player-season.parquet", fetched_at: "2026-09-08T00:00:00Z", sha256: "a".repeat(64) }) }] }) };
        return { all: async () => ({ results: [] }) };
      },
    }));
    const response = await app.request(
      "/api/basketball/research/publisher-stats?season=2026&category=averages&stat=avgPoints",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source_receipts: [{ dataset: "player_season", season: 2026, url: "https://example.test/player-season.parquet", sha256: "a".repeat(64) }],
    });
  });

  it("rejects invalid team and boutique source parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/team-stats?category=made-up&stat=avgPoints",
      "/api/basketball/research/team-stats?stat=avgPoints&page=-1",
      "/api/basketball/research/boutique?kind=other",
      "/api/basketball/research/boutique?kind=ratings&metric=not_a_metric",
      "/api/basketball/research/boutique?season=2000",
      "/api/basketball/research/boutique?kind=players&playerId=not-an-id",
      "/api/basketball/research/boutique?kind=ratings&playerId=123",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid lineup metrics before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/lineups?season=2018",
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

  it("returns ESPN profile source receipt metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ value: "Guard" }] },
      { results: [{ value: "Active" }] },
      { results: [{ total: 123 }] },
      { results: [{ fetched_at: "2026-09-08T01:31:13Z", sha256: "b".repeat(64) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/player-core?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [2026],
      total: 123,
      source: { fetched_at: "2026-09-08T01:31:13Z" },
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("returns NCAA roster source receipt metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ value: "Sr." }] },
      { results: [{ value: "G" }] },
      { results: [{ total: 456 }] },
      { results: [{ fetched_at: "2026-09-08T02:48:45Z", sha256: "c".repeat(64) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-rosters?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [2026],
      total: 456,
      source: { fetched_at: "2026-09-08T02:48:45Z" },
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects invalid NCAA player ranking parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-player-rankings?metric=made_up",
      "/api/basketball/research/ncaa-player-rankings?season=2009",
      "/api/basketball/research/ncaa-player-rankings?minGames=0",
      "/api/basketball/research/ncaa-player-rankings?minMinutes=-1",
      "/api/basketball/research/ncaa-player-rankings?minVolume=-1",
      "/api/basketball/research/ncaa-player-rankings?page=-1",
      "/api/basketball/research/ncaa-player-rankings?position=%27%20OR%201%3D1%20--",
      "/api/basketball/research/ncaa-player-rankings?classYear=%27%20OR%201%3D1%20--",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("returns NCAA ranking source receipt clocks with metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ value: "G" }] },
      { results: [{ value: "Fr." }] },
      { results: [{ dataset: "ncaa_player_box", fetched_at: "2026-09-08T02:12:45Z", sha256: "a".repeat(64) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-player-rankings?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [2026],
      sources: [{ dataset: "ncaa_player_box", fetched_at: "2026-09-08T02:12:45Z" }],
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects unsafe NCAA roster filters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-rosters?season=2009",
      "/api/basketball/research/ncaa-rosters?page=-1",
      "/api/basketball/research/ncaa-rosters?position=%27%20OR%201%3D1%20--",
      "/api/basketball/research/ncaa-rosters?classYear=%27%20OR%201%3D1%20--",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid NCAA shooting profile parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-shooting?season=2018",
      "/api/basketball/research/ncaa-shooting?metric=made_up",
      "/api/basketball/research/ncaa-shooting?minAttempts=0",
      "/api/basketball/research/ncaa-shooting?page=-1",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid NCAA career parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-careers?fromSeason=2009",
      "/api/basketball/research/ncaa-careers?metric=made_up",
      "/api/basketball/research/ncaa-careers?minMinutes=-1",
      "/api/basketball/research/ncaa-careers?page=-1",
      "/api/basketball/research/ncaa-careers?fromSeason=2026&toSeason=2010",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("rejects invalid NCAA high-school pipeline parameters before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/ncaa-high-schools?season=2009",
      "/api/basketball/research/ncaa-high-schools?metric=made_up",
      "/api/basketball/research/ncaa-high-schools?minPlayers=0",
      "/api/basketball/research/ncaa-high-schools?page=-1",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("returns the NCAA roster receipt for high-school pipeline metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ total: 42 }] },
      { results: [{ fetched_at: "2026-09-08T02:48:45Z", sha256: "b".repeat(64) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-high-schools?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 42,
      source: { fetched_at: "2026-09-08T02:48:45Z", sha256: "b".repeat(64) },
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("returns the NCAA player-box receipt for archive metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ total: 99 }] },
      { results: [{ fetched_at: "2026-09-08T02:12:45Z", sha256: "c".repeat(64) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-player-box?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 99,
      source: { fetched_at: "2026-09-08T02:12:45Z", sha256: "c".repeat(64) },
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("returns the NCAA shot-release receipt for shooting metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ fetched_at: "2026-09-08T02:13:00Z", sha256: "d".repeat(64) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-shooting?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: { fetched_at: "2026-09-08T02:13:00Z", sha256: "d".repeat(64) },
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects invalid market archive parameters before querying D1", async () => {
    for (const path of [
      "/api/research/markets?sport=baseball",
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
