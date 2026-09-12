import { describe, expect, it, vi } from "vitest";
import app from "../src/index";

describe("bball api", () => {
  it("serves health without a database binding", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("filters global search to the requested football sport", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        all: async () => ({
          results: sql.includes("FROM teams")
            ? [{ id: "t_alabama", name: "Alabama", sportCode: "MFB", type: "team" }]
            : [{ id: "p_example", name: "Example Player", sportCode: "MFB", type: "player" }],
        }),
      }),
    }));
    const response = await app.request(
      "/api/search?q=Alabama&sport=s_fbl",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { sport: string; results: Array<Record<string, unknown>> };
    expect(body.sport).toBe("s_fbl");
    expect(body.results[0]).toMatchObject({ id: "t_alabama", type: "team", sportCode: "MFB" });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("sport_code = ?"));
  });

  it("finds football athletes from the football source warehouse", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        all: async () => ({
          results: sql.includes("FROM football_stats")
            ? [{ id: "4918111", name: "A'Marion Peterson", sportCode: "MFB", type: "player" }]
            : [],
        }),
      }),
    }));
    const response = await app.request("/api/search?q=Peterson&sport=s_fbl", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { results: Array<Record<string, unknown>> };
    expect(body.results).toEqual([{ id: "4918111", name: "A'Marion Peterson", sportCode: "MFB", type: "player" }]);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("FROM football_stats"));
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("json_extract(stats_json,'$.rusher_player_name')"));
  });

  it("finds historical NCAA basketball athletes in the separate research warehouse", async () => {
    const prepare = vi.fn(() => ({ bind: () => ({ all: async () => ({ results: [] }) }) }));
    const researchPrepare = vi.fn((sql: string) => ({
      bind: () => ({
        all: async () => ({
          results: sql.includes("bb_ncaa_player_season")
            ? [{ id: "ncaa-42", name: "Example Veteran", sportCode: "MBB", type: "player", source: "ncaa", latest_season: 2024 }]
            : [],
        }),
      }),
    }));
    const response = await app.request(
      "/api/search?q=Veteran&sport=s_mbb",
      {},
      { DB: { prepare }, RESEARCH_DB: { prepare: researchPrepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { results: Array<Record<string, unknown>> };
    expect(body.results).toEqual([{ id: "ncaa-42", name: "Example Veteran", sportCode: "MBB", type: "player", source: "ncaa", latest_season: 2024 }]);
    expect(researchPrepare).toHaveBeenCalledWith(expect.stringContaining("FROM bb_ncaa_player_season"));
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

  it("returns a compact exact-ID football career trail", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        all: async () => ({
          results: sql.includes("ORDER BY season DESC")
            ? [
                {
                  season: 2025,
                  dataset: "rushing",
                  category: "rushing",
                  team_id: "10",
                  stats_json: JSON.stringify({ pos_team: "Example U", games: "10", plays: "100", yards: "700", rushing_td: "8", TEPA: "12.5", EPAplay: "0.125" }),
                },
                {
                  season: 2024,
                  dataset: "rushing",
                  category: "rushing",
                  team_id: "9",
                  stats_json: JSON.stringify({ pos_team: "Earlier U", games: "8", plays: "70", yards: "400", rushing_td: "4", TEPA: "4.5", EPAplay: "0.064" }),
                },
                {
                  season: 2025,
                  dataset: "box",
                  category: "rushing",
                  team_id: "10",
                  stats_json: JSON.stringify({ game_id: "401" }),
                },
              ]
            : [],
        }),
      }),
    }));
    const response = await app.request("/api/football/players/123/career", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { player_id: string; seasons: number[]; source_records: number; box_games: Record<string, number>; rows: Array<Record<string, unknown>> };
    expect(body).toMatchObject({ player_id: "123", seasons: [2025, 2024], source_records: 2, box_games: { "2025": 1 } });
    expect(body.rows[0]).toMatchObject({ season: 2025, team: "Example U", plays: 100, epa: 12.5 });
  });

  it("accepts a 2010 football player log from the expanded archive", async () => {
    const prepare = vi.fn(() => ({
      bind: () => ({
        first: async () => ({ total: 0 }),
        all: async () => ({ results: [] }),
      }),
    }));
    const response = await app.request("/api/football/players/123?season=2010", {}, { DB: { prepare } });
    expect(response.status).toBe(404);
  });

  it("serves bounded football forecasts from the latest registered D1 model", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT id,created_at,cutoff,artifact_json FROM football_models")) {
        return {
          first: async () => ({
            id: "ridge-team-calibrated-v2-test",
            created_at: "2026-09-09T02:00:00Z",
            cutoff: "2026-09-09T02:00:00Z",
            artifact_json: "{}",
          }),
        };
      }
      if (sql.includes("count(*) AS total FROM football_predictions")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [{
              game_id: "401900001",
              model_id: "ridge-team-calibrated-v2-test",
              created_at: "2026-09-09T02:00:00Z",
              home_margin: 6.5,
              total: 48.25,
              home_win_probability: 0.64,
              season: 2026,
              kickoff: "2026-09-12T19:00:00Z",
              home_id: "1",
              away_id: "2",
              home_name: "Home",
              away_name: "Away",
              home_conference: "Home Conf",
              away_conference: "Away Conf",
              home_division: "fbs",
              away_division: "fbs",
              home_score: null,
              away_score: null,
              completed: 0,
              neutral: 0,
              week: 2,
              venue: "Stadium",
              time_tbd: 0,
            }],
          }),
        }),
      };
    });
    const response = await app.request(
      "/api/football/research/forecasts?season=2026&status=upcoming&limit=2",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { total: number; rows: Array<{ home_margin: number; total: number; home_win_probability: number }> };
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({ home_margin: 6.5, total: 48.25, home_win_probability: 0.64 });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("g.kickoff>?"))).toBe(true);
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
        { results: [{ total: 7, neutral: 2, missing_venue: 1, unconfirmed_start: 3, missing_participant: 0, same_participant: 0, invalid_periods: 0, completed_missing_score: 0, negative_score: 0, unfinished_with_score: 0, duplicate_contest_ids: 0, neutral_missing_venue: 0 }] },
        { results: [{ total: 6, paired_box_games: 5, missing_box_games: 1, missing_team_box_rows: 1, duplicate_team_box_keys: 0, negative_field_games: 0, nonpositive_possession_games: 0, invalid_period_games: 0, outlier_pace_games: 1, score_mismatch_games: 0, valid_estimate_games: 4 }] },
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
      neutral_missing_venue: 0,
      unconfirmed_start: 3,
      missing_participant: 0,
      same_participant: 0,
      duplicate_contest_ids: 0,
      invalid_periods: 0,
      completed_missing_score: 0,
      negative_score: 0,
      unfinished_with_score: 0,
    });
    expect((body as typeof body & { possession_validation: Record<string, number> }).possession_validation).toEqual({
      total: 6,
      paired_box_games: 5,
      missing_box_games: 1,
      missing_team_box_rows: 1,
      duplicate_team_box_keys: 0,
      negative_field_games: 0,
      nonpositive_possession_games: 0,
      invalid_period_games: 0,
      outlier_pace_games: 1,
      score_mismatch_games: 0,
      valid_estimate_games: 4,
    });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("bb_sources"))).toBe(true);
    expect(prepare.mock.calls.some(([query]) => String(query).includes("missing_participant"))).toBe(true);
    expect(prepare.mock.calls.some(([query]) => String(query).includes("unfinished_with_score"))).toBe(true);
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
    const legacyPrepare = vi.fn();
    const response = await app.request("/api/football/coverage", {}, { DB: { prepare: legacyPrepare }, FOOTBALL_DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      coverage: [{ dataset: "games", rows: 12 }, { dataset: "box", rows: 34 }],
      source_receipts: [{ dataset: "box", source_count: 2, latest_source_at: "2026-09-08T00:00:00Z" }],
    });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("football_sources"))).toBe(true);
    expect(legacyPrepare).not.toHaveBeenCalled();
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
                source_start: "2026-11-02T05:00:00.000Z",
                source_time_valid: 1,
                source_observed_at: "2026-09-12T07:00:00.000Z",
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
      rows: Array<{ prediction: Record<string, unknown> | null; source_start?: string | null; source_time_valid?: boolean | null; source_observed_at?: string | null }>;
    };
    expect(body).toMatchObject({ season: 2027, status: "upcoming", model: "latest", page_size: 2, total: 2 });
    expect(body.rows[0].prediction).toEqual({ home_margin: 4.5, home_win_probability: 0.62 });
    expect(body.rows[0]).toMatchObject({ source_start: "2026-11-02T05:00:00.000Z", source_time_valid: true, source_observed_at: "2026-09-12T07:00:00.000Z" });
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
        evaluation_interval_coverage: 0.79,
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
      evaluation_interval_coverage: 0.79,
    });
    expect(body.models[0]).not.toHaveProperty("efficiency");
    expect(batch).toHaveBeenCalledOnce();
  });

  it("supports an exact game lookup for brief provenance checks", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({ results: [{
            game_id: "401902275",
            model_id: "basketball-efficiency-v1-test",
            created_at: "2026-09-08T00:00:00Z",
            prediction_json: JSON.stringify({ home_margin: 4.5 }),
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
          }] }),
        }),
      };
    });
    const response = await app.request(
      "/api/basketball/research/forecasts?season=2027&gameId=401902275&model=latest&limit=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 1, rows: [{ game_id: "401902275" }] });
    expect(prepare.mock.calls.some(([query]) => String(query).includes("f.game_id=?"))).toBe(true);
  });

  it("rejects invalid basketball forecast filters before querying D1", async () => {
    const prepare = vi.fn();
    for (const path of [
      "/api/basketball/research/forecasts?season=2020",
      "/api/basketball/research/forecasts?status=settled",
      "/api/basketball/research/forecasts?limit=101",
      "/api/basketball/research/forecasts?model=unsafe%20model",
      "/api/basketball/research/forecasts?page=-1",
      "/api/basketball/research/forecasts?gameId=not-a-game-id",
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
      "/api/basketball/research/news?q=portal&division=D-II&limit=10",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<{ categories: string[]; categories_json?: string }> };
    expect(body.total).toBe(1);
    expect(body.rows[0].categories).toEqual(["NCAA Men's Basketball"]);
    expect(body.rows[0]).not.toHaveProperty("categories_json");
    expect(prepare.mock.calls.some(([query]) => String(query).includes("ESCAPE"))).toBe(true);
    expect(prepare.mock.calls.some(([query]) => String(query).includes("division=?"))).toBe(true);
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects unsafe publisher-news filters before querying D1", async () => {
    const prepare = vi.fn();
    for (const path of [
      "/api/basketball/research/news?sport=mens_college_basketball",
      "/api/basketball/research/news?limit=101",
      "/api/basketball/research/news?page=-1",
      "/api/basketball/research/news?division=Division%20I",
    ]) {
      expect((await app.request(path, {}, { DB: { prepare } })).status).toBe(400);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("falls back to the bundled publisher release when the news warehouse is unavailable", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 unavailable"));
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      schema_version: 2,
      generated_at: "2026-09-11T16:04:39.076753Z",
      feeds: [{ publisher: "NCAA.com", sport: "mens-college-basketball", division: "D-II" }],
      articles: [{
        id: "bundled-1",
        publisher: "NCAA.com",
        sport: "mens-college-basketball",
        division: "D-II",
        headline: "Portal update",
        description: "A source-linked update.",
        published: "2026-09-11T14:17:33Z",
        link: "https://www.ncaa.com/news/basketball-men/d2/article",
        categories: ["transfer portal"],
        author: "Reporter",
      }],
    }), { headers: { "Content-Type": "application/json" } }));
    const response = await app.request(
      "/api/basketball/research/news?meta=1&division=D-II&q=portal",
      {},
      { DB: { prepare: vi.fn() }, RESEARCH_DB: { batch }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; summary: { total: number }; releases: unknown[] };
    expect(body.source).toBe("bundled_release");
    expect(body.summary.total).toBe(1);
    expect(body.releases).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
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

  it("returns a retryable status when the NCAA leaderboard catalog is unavailable", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await app.request(
      "/api/basketball/research/ncaa-leaders?meta=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The NCAA leaderboard catalog is temporarily unavailable.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
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
      provenance: { kind: "publisher_snapshot_with_exact_id_fill", publisher_rank: true },
      rows: [{ publisher_rank: 7, rpg: 12.5 }],
    });
  });

  it("accepts NCAA national total-stat leaderboards", async () => {
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({
          results: [{
            player_id: "42",
            division: 1,
            name: "Example Player",
            team_name: "Example U",
            stat_value: 901,
            publisher_rank: null,
            total_count: 1,
            payload_json: JSON.stringify({ player_id: 42, pts: 901 }),
          }],
        }),
      })),
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-leaders?stat=pts&division=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stat: "pts",
      rows: [{ pts: 901, publisher_rank: null }],
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("json_extract(payload_json, '$.pts')"));
  });

  it("serves compact NCAA leaderboard coverage metadata from D1", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({
          results: [
            {
              division: 1,
              ppg: 18.2,
              rpg: null,
              apg: null,
              mpg: 31.5,
              payload_json: JSON.stringify({ pts: 546, fg_pct: 54.1 }),
            },
            {
              division: 2,
              ppg: null,
              rpg: 8.1,
              apg: null,
              mpg: null,
              payload_json: JSON.stringify({ pts: 301 }),
            },
          ],
        }),
      })),
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-leaders?meta=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      coverage: { players: number; divisions: Record<string, Record<string, number>> };
    };
    expect(body.coverage).toMatchObject({
      players: 2,
      divisions: {
        "1": { players: 1, ppg: 1, mpg: 1, pts: 1, fg_pct: 1 },
        "2": { players: 1, rpg: 1, pts: 1 },
      },
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT division,ppg,rpg,apg,mpg,payload_json"));
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

  it("returns a retryable response when the NCAA player game archive is busy", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-card/123/games?season=2026&limit=500",
      {},
      { DB: { prepare: vi.fn(), batch } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The NCAA player game archive is temporarily unavailable." });
  });

  it("returns a retryable response when the NCAA player card archive is busy", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-card/123?season=2026",
      {},
      { DB: { prepare: vi.fn(), batch } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The NCAA player card is temporarily unavailable." });
  });

  it("attaches selected-season source receipts to the NCAA player card", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => sql.includes("FROM bb_sources")
        ? { all: async () => ({ results: [{ dataset: "ncaa_player_box", season: 2026, receipt_json: JSON.stringify({ url: "https://example.test/ncaa-box.parquet", fetched_at: "2026-09-08T02:12:45Z", sha256: "a".repeat(64) }) }] }) }
        : { all: async () => ({ results: [] }) },
    }));
    const batch = vi.fn(async () => [
      { results: [{ season: 2026, player_id: "123", team_id: "7", player_name: "Example Player", team_name: "Example U", games: 10, stats_json: "{}" }] },
      { results: [] },
      { results: [] },
      { results: [] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-player-card/123?season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source_receipts: [{ dataset: "ncaa_player_box", season: 2026, url: "https://example.test/ncaa-box.parquet", sha256: "a".repeat(64) }],
    });
  });

  it("reads NCAA player-game coverage from the dedicated archive binding", async () => {
    const prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({ results: [] }),
    });
    const gamePrepare = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ rows: 1771275 }),
    });
    const batch = vi.fn().mockResolvedValue([
      ...Array.from({ length: 17 }, () => ({ results: [{ rows: 7 }] })),
      { results: [{ total: 7, neutral: 0, missing_venue: 0, unconfirmed_start: 0, missing_participant: 0, same_participant: 0, invalid_periods: 0, completed_missing_score: 0, negative_score: 0, unfinished_with_score: 0, duplicate_contest_ids: 0, neutral_missing_venue: 0 }] },
      { results: [{ total: 0, paired_box_games: 0, missing_box_games: 0, missing_team_box_rows: 0, duplicate_team_box_keys: 0, negative_field_games: 0, nonpositive_possession_games: 0, invalid_period_games: 0, outlier_pace_games: 0, score_mismatch_games: 0, valid_estimate_games: 0 }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/coverage",
      {},
      { DB: { prepare, batch }, NCAA_BOX_DB: { prepare: gamePrepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { coverage: Array<{ dataset: string; rows: number }> };
    expect(body.coverage.find((entry) => entry.dataset === "ncaa_player_box")).toEqual({ dataset: "ncaa_player_box", rows: 1771275 });
    expect(gamePrepare).toHaveBeenCalledWith("SELECT count(*) AS rows FROM bb_ncaa_player_box");
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects unknown publisher stat fields before querying D1", async () => {
    for (const path of [
      "/api/basketball/research/publisher-stats?stat=not-a-source-field",
      "/api/basketball/research/publisher-stats?category=totals&stat=avgPoints",
      "/api/basketball/research/publisher-stats?page=-1",
      "/api/basketball/research/publisher-stats?min_games=-1",
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

  it("applies the source games-played threshold to publisher rows", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => sql.includes("count(*) AS total")
        ? { first: async () => ({ total: 1, non_null: 1 }) }
        : { all: async () => ({ results: [] }) },
    }));
    const response = await app.request(
      "/api/basketball/research/publisher-stats?season=2026&category=averages&stat=avgPoints&min_games=15",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const sql = prepare.mock.calls.find(([query]) => String(query).includes("count(*) AS total"))?.[0];
    expect(String(sql)).toContain("gamesPlayed.value");
    expect(String(sql)).toContain(">= ?");
  });

  it("returns retryable responses when source-stat catalogs or rows are busy", async () => {
    const catalogResponse = await app.request(
      "/api/basketball/research/publisher-stats?meta=1",
      {},
      { DB: { prepare: vi.fn().mockReturnValue({ all: vi.fn().mockRejectedValue(new Error("busy")) }) } },
    );
    expect(catalogResponse.status).toBe(503);
    expect(catalogResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await catalogResponse.json()).toEqual({ error: "The source-field catalog is temporarily unavailable." });

    const rowPrepare = vi.fn((sql: string) => sql.includes("count(*) AS total")
      ? { bind: () => ({ first: vi.fn().mockResolvedValue({ total: 1, non_null: 1 }) }) }
      : { bind: () => ({ all: vi.fn().mockRejectedValue(new Error("busy")) }) });
    const rowResponse = await app.request(
      "/api/basketball/research/publisher-stats?season=2026&category=averages&stat=avgPoints",
      {},
      { DB: { prepare: rowPrepare } },
    );
    expect(rowResponse.status).toBe(503);
    expect(rowResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await rowResponse.json()).toEqual({ error: "The source statistics archive is temporarily unavailable." });
  });

  it("returns retryable responses when the team-stat catalog or rows are busy", async () => {
    const catalogResponse = await app.request(
      "/api/basketball/research/team-stats?meta=1",
      {},
      { DB: { prepare: vi.fn().mockReturnValue({ all: vi.fn().mockRejectedValue(new Error("busy")) }) } },
    );
    expect(catalogResponse.status).toBe(503);
    expect(catalogResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await catalogResponse.json()).toEqual({ error: "The team-field catalog is temporarily unavailable." });

    const rowPrepare = vi.fn((sql: string) => sql.includes("count(*) AS total")
      ? { bind: () => ({ first: vi.fn().mockResolvedValue({ total: 1, non_null: 1 }) }) }
      : { bind: () => ({ all: vi.fn().mockRejectedValue(new Error("busy")) }) });
    const rowResponse = await app.request(
      "/api/basketball/research/team-stats?season=2026&category=offensive&stat=avgPoints",
      {},
      { DB: { prepare: rowPrepare } },
    );
    expect(rowResponse.status).toBe(503);
    expect(rowResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await rowResponse.json()).toEqual({ error: "The team statistics archive is temporarily unavailable." });
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
      "/api/basketball/research/boutique?kind=ratings&ids=150,not-an-id",
      "/api/basketball/research/boutique?kind=players&ids=150",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("returns boutique model source receipts in the catalog", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ season: 2026, receipt_json: JSON.stringify({ url: "https://example.test/ratings.parquet", fetched_at: "2026-09-08T00:00:00Z", sha256: "c".repeat(64) }) }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/boutique?kind=ratings&meta=1",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source_receipts: [{ season: 2026, url: "https://example.test/ratings.parquet", sha256: "c".repeat(64) }],
    });
  });

  it("supports exact team-ID batches for matchup model comparisons", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("count(*) AS total")) {
        return { bind: () => ({ first: vi.fn().mockResolvedValue({ total: 2, non_null: 2 }) }) };
      }
      return {
        bind: (...args: unknown[]) => {
          expect(args).toEqual([2026, "150", "248", 0]);
          return { all: vi.fn().mockResolvedValue({ results: [
            { id: "150", team: "Duke Blue Devils", value: 28.4 },
            { id: "248", team: "North Carolina Tar Heels", value: 22.1 },
          ] }) };
        },
      };
    });
    const response = await app.request(
      "/api/basketball/research/boutique?kind=ratings&season=2026&metric=adj_em&ids=150,248",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 2,
      rows: [{ id: "150" }, { id: "248" }],
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("p.team_id IN (?,?)"));
  });

  it("returns a retryable response when the boutique catalog is busy", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await app.request(
      "/api/basketball/research/boutique?kind=ratings&meta=1",
      {},
      { DB: { prepare: vi.fn(), batch } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The boutique model catalog is temporarily unavailable." });
  });

  it("returns a retryable response when the boutique rows are busy", async () => {
    const first = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ first, all: async () => ({ results: [] }) })) }));
    const response = await app.request(
      "/api/basketball/research/boutique?kind=ratings&season=2026",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The boutique model archive is temporarily unavailable." });
  });

  it("returns a retryable response when the lineup catalog or rows are busy", async () => {
    const catalog = await app.request(
      "/api/basketball/research/lineups?meta=1",
      {},
      { DB: { prepare: vi.fn().mockReturnValue({ all: vi.fn().mockRejectedValue(new Error("D1 busy")) }) } },
    );
    expect(catalog.status).toBe(503);
    expect(catalog.headers.get("Cache-Control")).toBe("no-store");
    expect(await catalog.json()).toEqual({ error: "The lineup catalog is temporarily unavailable." });

    const prepare = vi.fn().mockReturnValue({ bind: vi.fn(() => ({ first: vi.fn().mockRejectedValue(new Error("D1 busy")), all: async () => ({ results: [] }) })) });
    const rows = await app.request(
      "/api/basketball/research/lineups?season=2026&metric=net_per_100",
      {},
      { DB: { prepare } },
    );
    expect(rows.status).toBe(503);
    expect(rows.headers.get("Cache-Control")).toBe("no-store");
    expect(await rows.json()).toEqual({ error: "The lineup archive is temporarily unavailable." });
  });

  it("returns a retryable response when the possession-style catalog or rows are busy", async () => {
    const catalog = await app.request(
      "/api/basketball/research/possession-style?meta=1",
      {},
      { DB: { batch: vi.fn().mockRejectedValue(new Error("D1 busy")) } },
    );
    expect(catalog.status).toBe(503);
    expect(catalog.headers.get("Cache-Control")).toBe("no-store");
    expect(await catalog.json()).toEqual({ error: "The possession-style catalog is temporarily unavailable." });

    const prepare = vi.fn((sql: string) => sql.includes("count(*)")
      ? { bind: () => ({ first: vi.fn().mockResolvedValue({ total: 1 }) }) }
      : { bind: () => ({ all: vi.fn().mockRejectedValue(new Error("D1 busy")) }) });
    const rows = await app.request(
      "/api/basketball/research/possession-style?season=2026",
      {},
      { DB: { prepare } },
    );
    expect(rows.status).toBe(503);
    expect(rows.headers.get("Cache-Control")).toBe("no-store");
    expect(await rows.json()).toEqual({ error: "The possession-style archive is temporarily unavailable." });
  });

  it("returns a retryable response when the player crosswalk catalog or rows are busy", async () => {
    const catalog = await app.request(
      "/api/basketball/research/player-crosswalk?meta=1",
      {},
      { DB: { batch: vi.fn().mockRejectedValue(new Error("D1 busy")) } },
    );
    expect(catalog.status).toBe(503);
    expect(catalog.headers.get("Cache-Control")).toBe("no-store");
    expect(await catalog.json()).toEqual({ error: "The player crosswalk catalog is temporarily unavailable." });

    const prepare = vi.fn((sql: string) => sql.includes("COUNT(*) AS total")
      ? { bind: () => ({ first: vi.fn().mockResolvedValue({ total: 1 }) }) }
      : { bind: () => ({ all: vi.fn().mockRejectedValue(new Error("D1 busy")) }) });
    const rows = await app.request(
      "/api/basketball/research/player-crosswalk?season=2026",
      {},
      { DB: { prepare } },
    );
    expect(rows.status).toBe(503);
    expect(rows.headers.get("Cache-Control")).toBe("no-store");
    expect(await rows.json()).toEqual({ error: "The player crosswalk archive is temporarily unavailable." });
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

  it("searches the complete ESPN profile archive when season=all", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total")) {
        return { bind: () => ({ first: async () => ({ total: 2 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [
              { season: 2026, id: "10", name: "Example Player", position: "Guard", team: "Current U", profile_json: JSON.stringify({ display_name: "Example Player" }) },
              { season: 2010, id: "10", name: "Example Player", position: "Guard", team: "Earlier U", profile_json: JSON.stringify({ display_name: "Example Player" }) },
            ],
          }),
        }),
      };
    });
    const response = await app.request(
      "/api/basketball/research/player-core?season=all&q=Example%20Player&page=0",
      {},
      { RESEARCH_DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      season: "all",
      total: 2,
      rows: expect.arrayContaining([
        expect.objectContaining({ season: 2026, id: "10" }),
        expect.objectContaining({ season: 2010, id: "10" }),
      ]),
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("FROM bb_player_core"));
  });

  it("returns a retryable response when the ESPN profile catalog is busy", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await app.request(
      "/api/basketball/research/player-core?meta=1&season=2026",
      {},
      { DB: { prepare: vi.fn(), batch } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The ESPN profile catalog is temporarily unavailable." });
  });

  it("returns a retryable response when the ESPN profile rows are busy", async () => {
    const first = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ first, all: async () => ({ results: [] }) })) }));
    const response = await app.request(
      "/api/basketball/research/player-core?season=2026",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The ESPN profile archive is temporarily unavailable." });
  });

  it("returns NCAA roster source receipt metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ value: "Sr." }] },
      { results: [{ value: "G" }] },
      { results: [{ total: 456 }] },
      { results: [{ url: "https://example.test/ncaa-rosters.parquet", fetched_at: "2026-09-08T02:48:45Z", sha256: "c".repeat(64) }] },
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
      source: { url: "https://example.test/ncaa-rosters.parquet", fetched_at: "2026-09-08T02:48:45Z" },
    });
    expect(batch).toHaveBeenCalledOnce();
  });

  it("returns program-level NCAA roster continuity without implying person matches", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT COUNT(*) AS total FROM joined")) {
        return { bind: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ total: 2 }) })) };
      }
      return {
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({
            results: [{
              team_id: "12",
              team_name: "Example State",
              previous_players: 10,
              current_players: 11,
              overlap_players: 7,
              new_players: 4,
              departed_players: 3,
              continuity_rate: 7 / 11,
            }],
          }),
        })),
      };
    });
    const response = await app.request(
      "/api/basketball/research/ncaa-rosters/transitions?fromSeason=2025&toSeason=2026",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      from_season: 2025,
      to_season: 2026,
      total: 2,
      rows: [{ team_id: "12", overlap_players: 7, continuity_rate: 7 / 11 }],
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("JOIN bb_ncaa_rosters p"));
  });

  it("rejects reverse NCAA roster transition windows", async () => {
    const response = await app.request(
      "/api/basketball/research/ncaa-rosters/transitions?fromSeason=2026&toSeason=2025",
      {},
      {},
    );
    expect(response.status).toBe(400);
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
      { results: [{ dataset: "ncaa_player_box", url: "https://example.test/ncaa-player-box.parquet", fetched_at: "2026-09-08T02:12:45Z", sha256: "a".repeat(64) }] },
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

  it("ranks NCAA turnover rate from the lowest recorded rate first", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 2 }),
        all: vi.fn().mockResolvedValue({ results: [
          { player_name: "Low turnover", value: 8.2, rank: 1 },
          { player_name: "High turnover", value: 18.4, rank: 2 },
        ] }),
      })),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-rankings?season=2026&metric=tov_rate&minGames=5&minMinutes=200&minVolume=50",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { direction: string; rows: Array<{ player_name: string; rank: number }> };
    expect(body.direction).toBe("asc");
    expect(body.rows[0]).toMatchObject({ player_name: "Low turnover", rank: 1 });
    const rowSql = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("RANK() OVER"));
    expect(rowSql).toContain("ORDER BY value ASC");
    expect(rowSql).toContain("ORDER BY value ASC, player_name ASC");
  });

  it("ranks NCAA personal fouls per game from retained source fields", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 1 }),
        all: vi.fn().mockResolvedValue({ results: [{ player_name: "Example Defender", fouls: 42, games: 20, value: 2.1, rank: 1 }] }),
      })),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-rankings?season=2026&metric=fpg&minGames=5&minMinutes=200",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { metric: string; rows: Array<{ fouls: number; value: number }> };
    expect(body.metric).toBe("fpg");
    expect(body.rows[0]).toMatchObject({ fouls: 42, value: 2.1 });
    const aggregateSql = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("AS fouls"));
    expect(aggregateSql).toContain("json_extract(s.stats_json,'$.pf')");
    expect(aggregateSql).toContain("AS fouls");
    expect(prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("RANK() OVER"))).toContain("fouls / games");
  });

  it("ranks offensive and defensive rebounds per game from separate source totals", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 1 }),
        all: vi.fn().mockResolvedValue({ results: [{ player_name: "Glass Specialist", offensive_rebounds: 80, defensive_rebounds: 120, games: 20, value: 4, rank: 1 }] }),
      })),
      sql,
    }));
    for (const [metric, expression, alias] of [
      ["orpg", "offensive_rebounds / games", "AS offensive_rebounds"],
      ["drpg", "defensive_rebounds / games", "AS defensive_rebounds"],
    ] as const) {
      const response = await app.request(
        `/api/basketball/research/ncaa-player-rankings?season=2026&metric=${metric}&minGames=5&minMinutes=200`,
        {},
        { DB: { prepare } },
      );
      expect(response.status).toBe(200);
      expect((await response.json()) as { metric: string }).toMatchObject({ metric });
      const rankingSql = prepare.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.includes("RANK() OVER"));
      expect(rankingSql.some((sql) => sql.includes(expression))).toBe(true);
      expect(prepare.mock.calls.map(([sql]) => String(sql)).some((sql) => sql.includes(alias))).toBe(true);
    }
  });

  it("requires both rebound components before deriving total rebounds", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 0 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      })),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-rankings?season=2026&metric=rpg",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const aggregateSql = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("AS rebounds"));
    expect(aggregateSql).toContain("COUNT(json_extract(s.stats_json,'$.orb')) = COUNT(*) AND COUNT(json_extract(s.stats_json,'$.drb')) = COUNT(*)");
    expect(aggregateSql).not.toContain("COALESCE(CAST(json_extract(s.stats_json,'$.orb')");
  });

  it("ranks NCAA finishing accuracy with the matching attempt denominator", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 1 }),
        all: vi.fn().mockResolvedValue({ results: [{ player_name: "Example Finisher", value: 64.5, rank: 1 }] }),
      })),
      sql,
    }));
    for (const [metric, expression, denominator] of [
      ["ft_pct", "ftm / fta", "AS fta"],
      ["rim_pct", "rim_makes / rim_attempts", "AS rim_attempts"],
      ["mid_pct", "mid_makes / mid_attempts", "AS mid_attempts"],
    ] as const) {
      const response = await app.request(
        `/api/basketball/research/ncaa-player-rankings?season=2026&metric=${metric}&minGames=5&minMinutes=200&minVolume=25`,
        {},
        { DB: { prepare } },
      );
      expect(response.status).toBe(200);
      expect((await response.json()) as { metric: string }).toMatchObject({ metric });
      const rankingSql = prepare.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.includes("RANK() OVER"));
      expect(rankingSql.some((sql) => sql.includes(expression))).toBe(true);
      expect(prepare.mock.calls.map(([sql]) => String(sql)).some((sql) => sql.includes(denominator))).toBe(true);
    }
  });

  it("keeps missing NCAA season fields unavailable instead of ranking them as zero", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 0 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      })),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-player-rankings?season=2026&metric=ppg",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const aggregateSql = prepare.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("COUNT(json_extract(s.stats_json,'$.pts'))"));
    expect(aggregateSql).toContain("CASE WHEN COUNT(json_extract(s.stats_json,'$.pts')) > 0 THEN SUM(CAST(json_extract(s.stats_json,'$.pts') AS REAL)) ELSE NULL END AS points");
    expect(aggregateSql).toContain("CASE WHEN COUNT(json_extract(s.stats_json,'$.mins')) > 0 THEN SUM(CAST(json_extract(s.stats_json,'$.mins') AS REAL)) ELSE NULL END AS minutes");
    expect(aggregateSql).toContain("SUM(CASE WHEN json_extract(s.stats_json,'$.o_poss') IS NOT NULL THEN 1 ELSE 0 END) OVER (PARTITION BY s.season, s.team_id) = COUNT(*) OVER (PARTITION BY s.season, s.team_id)");
    expect(aggregateSql).toContain("json_extract(r.profile_json,'$.height')");
    expect(aggregateSql).toContain("json_extract(r.profile_json,'$.hometown')");
    expect(aggregateSql).toContain("json_extract(r.profile_json,'$.high_school')");
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
      "/api/basketball/research/ncaa-careers?minDenominator=-1",
      "/api/basketball/research/ncaa-careers?page=-1",
      "/api/basketball/research/ncaa-careers?classYear=%27%20OR%201%3D1%20--",
      "/api/basketball/research/ncaa-careers?position=%27%20OR%201%3D1%20--",
      "/api/basketball/research/ncaa-careers?fromSeason=2026&toSeason=2010",
    ]) {
      expect((await app.request(path, {}, {})).status).toBe(400);
    }
  });

  it("publishes the expanded historical player metric catalog", async () => {
    const prepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: [{ season: 2026 }] }),
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-careers?meta=1",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [2026],
      metrics: expect.arrayContaining([
        "efg",
        "orpg",
        "fpg",
        "topg",
        "three_pct",
        "ft_pct",
        "per40",
        "stocks40",
        "ast_to",
        "tov_rate",
        "three_rate",
        "reb40",
      ]),
    });
  });

  it("keeps missing NCAA career source totals unavailable", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 0 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      })),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-careers?fromSeason=2025&toSeason=2026&metric=ppg",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const aggregateSql = prepare.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("FROM bb_ncaa_player_season"));
    expect(aggregateSql).toContain("CASE WHEN json_extract(stats_json,'$.pts') IS NOT NULL THEN CAST(json_extract(stats_json,'$.pts') AS REAL) ELSE NULL END AS points");
    expect(aggregateSql).toContain("CASE WHEN json_extract(stats_json,'$.orb') IS NOT NULL AND json_extract(stats_json,'$.drb') IS NOT NULL");
    expect(aggregateSql).not.toContain("COALESCE(CAST(json_extract(stats_json");
  });

  it("applies a metric-aware denominator floor to NCAA career rates", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 0 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      })),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-careers?metric=three_pct&minDenominator=100",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const careerSql = prepare.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.includes("FROM bb_ncaa_player_season")).join("\n");
    expect(careerSql).toContain("tpa >= ?");
  });

  it("filters historical NCAA careers by exact roster class and position", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue({ total: 0 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      })),
      all: vi.fn().mockResolvedValue({ results: [{ season: 2026 }, { value: "Senior" }, { value: "G" }] }),
      sql,
    }));
    const response = await app.request(
      "/api/basketball/research/ncaa-careers?fromSeason=2025&toSeason=2026&classYear=Senior&position=G&metric=ppg",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const careerSql = prepare.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.includes("FROM bb_ncaa_player_season")).join("\n");
    expect(careerSql).toContain("json_extract(r.profile_json,'$.class')=?");
    expect(careerSql).toContain("json_extract(r.profile_json,'$.position')=?");
    expect(careerSql).toContain("AS class_year");
    expect(careerSql).toContain("AS position");
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

  it("returns a retryable response when the NCAA high-school catalog is busy", async () => {
    const batch = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const response = await app.request(
      "/api/basketball/research/ncaa-high-schools?meta=1&season=2026",
      {},
      { DB: { prepare: vi.fn(), batch } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The NCAA high-school catalog is temporarily unavailable." });
  });

  it("returns a retryable response when the NCAA high-school aggregate is busy", async () => {
    const first = vi.fn().mockRejectedValue(new Error("D1 busy"));
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ first, all: async () => ({ results: [] }) })) }));
    const response = await app.request(
      "/api/basketball/research/ncaa-high-schools?season=2026",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The NCAA high-school pipeline is temporarily unavailable." });
  });

  it("returns the NCAA player-box receipt for archive metadata", async () => {
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2026 }] },
      { results: [{ total: 99 }] },
      { results: [{ url: "https://example.test/player-box.parquet", fetched_at: "2026-09-08T02:12:45Z", sha256: "c".repeat(64) }] },
      { results: [{ total_rows: 99, missing_ids: 0, missing_names: 1, missing_game_dates: 0, malformed_game_dates: 0, same_team_opponent: 0, malformed_stats_json: 0, invalid_possessions: 0, impossible_shooting: 0, invalid_minutes: 0, zero_minutes_with_stats: 2 }] },
    ]);
    const response = await app.request(
      "/api/basketball/research/ncaa-player-box?meta=1&season=2026",
      {},
      { DB: { prepare, batch } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 99,
      source: { url: "https://example.test/player-box.parquet", fetched_at: "2026-09-08T02:12:45Z", sha256: "c".repeat(64) },
      validation: { total_rows: 99, missing_names: 1, zero_minutes_with_stats: 2 },
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
