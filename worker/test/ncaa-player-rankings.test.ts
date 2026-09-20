import { describe, expect, it, vi } from "vitest";
import { metricExpression, ncaaPlayerRankings, volumeColumn } from "../src/ncaa-player-rankings";

describe("NCAA player rankings availability", () => {
  it("defines half-court true shooting from retained context fields and qualifies by half-court FGA", () => {
    expect(metricExpression("half_ts")).toBe("CASE WHEN (half_fga + 0.475 * half_fta) > 0 THEN 100.0 * half_points / (2 * (half_fga + 0.475 * half_fta)) ELSE NULL END");
    expect(volumeColumn("half_ts")).toBe("half_fga");
  });

  it("derives two-point accuracy from all four retained shooting totals and qualifies by two-point attempts", () => {
    expect(metricExpression("two_pct")).toBe("CASE WHEN (fga - tpa) > 0 AND (fgm - tpm) >= 0 AND (fgm - tpm) <= (fga - tpa) THEN 100.0 * (fgm - tpm) / (fga - tpa) ELSE NULL END");
    expect(volumeColumn("two_pct")).toBe("(fga - tpa)");
  });

  it("derives self-created shot share from exact unassisted and total attempts", () => {
    expect(metricExpression("unassisted_rate")).toBe("CASE WHEN unassisted_total_attempts > 0 AND unassisted_attempts >= 0 AND unassisted_attempts <= unassisted_total_attempts THEN 100.0 * unassisted_attempts / unassisted_total_attempts ELSE NULL END");
    expect(volumeColumn("unassisted_rate")).toBe("unassisted_total_attempts");
  });

  it("derives putback accuracy from exact makes and attempts", () => {
    expect(metricExpression("putback_pct")).toBe("CASE WHEN putback_attempts > 0 AND putback_makes >= 0 AND putback_makes <= putback_attempts THEN 100.0 * putback_makes / putback_attempts ELSE NULL END");
    expect(volumeColumn("putback_pct")).toBe("putback_attempts");
  });

  it("requires every retained row before aggregating the new shooting denominators", async () => {
    const prepare = vi.fn((_query: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({ total: 0 })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=putback_pct&minGames=5&minMinutes=200&minVolume=25",
      {},
      { DB: { prepare } } as never,
    );
    expect(response.status).toBe(200);
    const sql = prepare.mock.calls.map(([query]) => String(query)).join("\n");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.pbacka')) = COUNT(*)");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.pbackm')) = COUNT(*)");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.fga_unast')) = COUNT(*)");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.fga')) = COUNT(*)");
  });

  it("returns a retryable status when the rankings catalog is unavailable", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await ncaaPlayerRankings.request(
      "/?meta=1&season=2026",
      {},
      { DB: { prepare, batch: vi.fn() } } as never,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The NCAA player rankings catalog is temporarily unavailable.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the published leaderboard snapshot when D1 is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      generated_at: "2026-09-17T10:00:00Z",
      players: [
        {
          player_id: 7,
          team_ncaa_id: 42,
          division: 1,
          name: "Example Guard",
          team_name: "Example U",
          class_year: "Jr.",
          position: "G",
          games: 20,
          mins: 600,
          pts: 400,
          ppg: 20,
          rpg: 4,
          apg: 5,
          spg: 2,
          bpg: 0.2,
          pf: 30,
          tov: 40,
          fga: 300,
          fgm: 150,
          tpa: 120,
          tpm: 48,
          fta: 80,
          ftm: 72,
          orb: 20,
          drb: 60,
          o_poss: 400,
          fg_pct: 50,
          three_pct: 40,
          ft_pct: 90,
          mpg: 30,
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ppg&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; total: number; rows: Array<Record<string, unknown>> };
    expect(body.source).toBe("published_fallback");
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({
      season: 2026,
      player_id: "7",
      team_id: "42",
      player_name: "Example Guard",
      team_name: "Example U",
      value: 20,
      rank: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps null published shooting fields unavailable instead of coercing them to zero", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const player = {
      division: 1,
      team_ncaa_id: 42,
      team_name: "Example U",
      class_year: "Jr.",
      position: "G",
      games: 20,
      mins: 600,
      pts: 300,
      fga: 240,
      fgm: 120,
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { ...player, player_id: 7, name: "Missing Threes", tpm: null },
        { ...player, player_id: 8, name: "Recorded Threes", tpm: 24 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=efg&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<Record<string, unknown>> };
    expect(body.total).toBe(1);
    expect(body.rows).toEqual([expect.objectContaining({
      player_id: "8",
      player_name: "Recorded Threes",
      value: 55,
    })]);
  });

  it("does not derive true shooting from an unavailable point total", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [{
        player_id: 7,
        division: 1,
        name: "Missing Points",
        team_name: "Example U",
        team_ncaa_id: 42,
        games: 20,
        mins: 600,
        pts: null,
        ppg: null,
        fga: 240,
        fta: 80,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ts&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 0, rows: [] });
  });

  it("does not admit a published row with unavailable minutes at a zero-minute floor", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [{
        player_id: 7,
        division: 1,
        name: "Missing Workload",
        team_name: "Example U",
        team_ncaa_id: 42,
        games: 20,
        mins: null,
        mpg: null,
        ppg: 18,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ppg&minGames=5&minMinutes=0",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 0, rows: [] });
  });

  it("ignores a retained rate cutoff for a metric without a volume denominator", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [{
        player_id: 7,
        division: 1,
        name: "Example Scorer",
        team_name: "Example U",
        team_ncaa_id: 42,
        games: 20,
        mins: 600,
        ppg: 18,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ppg&minGames=5&minMinutes=200&minVolume=400",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      rows: [expect.objectContaining({ player_id: "7", value: 18 })],
    });
  });

  it("uses recorded turnovers as the fallback sample for assist-to-turnover rankings", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const player = {
      division: 1,
      team_ncaa_id: 42,
      team_name: "Example U",
      games: 20,
      mins: 600,
      ast: 100,
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { ...player, player_id: 7, name: "Small Sample", tov: 24 },
        { ...player, player_id: 8, name: "Qualified Sample", tov: 50 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ast_to&minGames=5&minMinutes=200&minVolume=25",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      rows: [expect.objectContaining({ player_id: "8", value: 2 })],
    });
  });

  it("uses exact two-point attempts for the fallback qualification and withholds incomplete or impossible rows", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const player = {
      division: 1,
      team_ncaa_id: 42,
      team_name: "Example U",
      games: 20,
      mins: 600,
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { ...player, player_id: 7, name: "Qualified", fgm: 150, fga: 300, tpm: 48, tpa: 120 },
        { ...player, player_id: 8, name: "Small Sample", fgm: 70, fga: 150, tpm: 35, tpa: 100 },
        { ...player, player_id: 9, name: "Missing Three Attempts", fgm: 120, fga: 240, tpm: 30, tpa: null },
        { ...player, player_id: 10, name: "Impossible Residual", fgm: 40, fga: 200, tpm: 48, tpa: 100 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=two_pct&minGames=5&minMinutes=200&minVolume=100",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<Record<string, unknown>> };
    expect(body.total).toBe(1);
    expect(body.rows).toEqual([expect.objectContaining({
      player_id: "7",
      value: 100 * 102 / 180,
      fgm: 150,
      fga: 300,
      tpm: 48,
      tpa: 120,
    })]);
  });
});
