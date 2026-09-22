import { describe, expect, it, vi } from "vitest";
import { metricExpression, ncaaPlayerRankings, volumeColumn } from "../src/ncaa-player-rankings";

describe("NCAA player rankings availability", () => {
  it.each(["2", "3"])("ranks retained Division %s rows without leaking another division", async (division) => {
    const prepare = vi.fn();
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { division: 1, player_id: 1, team_ncaa_id: 10, name: "D-I player", team_name: "D-I U", games: 20, mins: 600, ppg: 30 },
        { division: 2, player_id: 2, team_ncaa_id: 20, name: "D-II player", team_name: "D-II U", games: 20, mins: 600, ppg: 20 },
        { division: 3, player_id: 3, team_ncaa_id: 30, name: "D-III player", team_name: "D-III U", games: 20, mins: 600, ppg: 10 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      `/?season=2026&division=${division}&metric=ppg`,
      {},
      { DB: { prepare }, ASSETS: { fetch } } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      division,
      total: 1,
      rows: [{ player_name: division === "2" ? "D-II player" : "D-III player", value: division === "2" ? 20 : 10, rank: 1 }],
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a lower-division ranking release is unavailable", async () => {
    const prepare = vi.fn();
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&division=2&metric=ppg",
      {},
      { DB: { prepare } } as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "division_metric_unavailable",
      requested_division: "2",
      available_divisions: ["1", "2", "3"],
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("exposes the retained NCAA double-double count as a ranking metric", () => {
    expect(metricExpression("dbl_dbl")).toBe("double_doubles");
    expect(volumeColumn("dbl_dbl")).toBeNull();
  });

  it("uses exact published double-double values and leaves missing values out", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 unavailable"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { division: 1, player_id: 7, team_ncaa_id: 42, name: "Leader", team_name: "Example U", games: 20, mins: 600, dbl_dbl: 12 },
        { division: 1, player_id: 8, team_ncaa_id: 43, name: "Missing", team_name: "Example V", games: 20, mins: 600, dbl_dbl: null },
        { division: 1, player_id: 9, team_ncaa_id: 44, name: "Runner up", team_name: "Example W", games: 20, mins: 600, dbl_dbl: 4 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=dbl_dbl&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "published_fallback",
      metric: "dbl_dbl",
      total: 2,
      direction: "desc",
      rows: [
        { player_id: "7", value: 12, rank: 1, double_doubles: 12 },
        { player_id: "9", value: 4, rank: 2, double_doubles: 4 },
      ],
    });
  });

  it("defines half-court true shooting from retained context fields and qualifies by half-court FGA", () => {
    expect(metricExpression("half_ts")).toBe("CASE WHEN (half_fga + 0.475 * half_fta) > 0 THEN 100.0 * half_points / (2 * (half_fga + 0.475 * half_fta)) ELSE NULL END");
    expect(volumeColumn("half_ts")).toBe("half_fga");
  });

  it("derives estimated usage from complete player and team workload denominators", () => {
    expect(metricExpression("usage_rate")).toBe("CASE WHEN minutes > 0 AND team_usage_events > 0 AND team_minutes > 0 THEN 100.0 * usage_events * team_minutes / (5.0 * minutes * team_usage_events) ELSE NULL END");
    expect(volumeColumn("usage_rate")).toBe("usage_events");
  });

  it("includes lower-is-better turnover rate in the all-around index", async () => {
    const prepare = vi.fn((_query: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({ total: 1 })),
        all: vi.fn(async () => ({ results: [{ player_name: "Complete sample", component_count: 9, tov_rate_value: 8.5, tov_rate_denominator: 600, value: 1.2, rank: 1 }] })),
      })),
    }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=balanced_index&minGames=5&minMinutes=200",
      {},
      { DB: { prepare } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      metric: "balanced_index",
      rows: [{ component_count: 9, tov_rate_value: 8.5, tov_rate_denominator: 600 }],
    });
    const sql = prepare.mock.calls.map(([query]) => String(query)).join("\n");
    expect(sql).toContain("AS tov_rate_value");
    expect(sql).toContain("AS tov_rate_denominator");
    expect(sql).toContain("tov_rate_mean - tov_rate_value");
  });

  it("keeps estimated usage unavailable when any team workload row is incomplete", async () => {
    const prepare = vi.fn((_query: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({ total: 0 })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=usage_rate&minGames=5&minMinutes=200&minVolume=100",
      {},
      { DB: { prepare } } as never,
    );
    expect(response.status).toBe(200);
    const sql = prepare.mock.calls.map(([query]) => String(query)).join("\n");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.fga')) = COUNT(*)");
    expect(sql).toContain("0.475 * CAST(json_extract(s.stats_json,'$.fta') AS REAL)");
    expect(sql).toContain("SUM(MIN(CASE WHEN json_extract(s.stats_json,'$.fga') IS NOT NULL");
    expect(sql).toContain("json_extract(s.stats_json,'$.fta') IS NOT NULL");
    expect(sql).toContain("json_extract(s.stats_json,'$.tov') IS NOT NULL");
    expect(sql).toContain("json_extract(s.stats_json,'$.mins') IS NOT NULL");
    expect(sql).toContain("PARTITION BY s.season, s.team_id");
  });

  it("derives two-point accuracy from all four retained shooting totals and qualifies by two-point attempts", () => {
    expect(metricExpression("two_pct")).toBe("CASE WHEN (fga - tpa) > 0 AND (fgm - tpm) >= 0 AND (fgm - tpm) <= (fga - tpa) THEN 100.0 * (fgm - tpm) / (fga - tpa) ELSE NULL END");
    expect(volumeColumn("two_pct")).toBe("(fga - tpa)");
  });

  it("derives overall field-goal accuracy from a valid exact make/attempt pair", () => {
    expect(metricExpression("fg_pct")).toBe("CASE WHEN fga > 0 AND fgm >= 0 AND fgm <= fga THEN 100.0 * fgm / fga ELSE NULL END");
    expect(volumeColumn("fg_pct")).toBe("fga");
  });

  it("derives self-created shot share from exact unassisted and total attempts", () => {
    expect(metricExpression("unassisted_rate")).toBe("CASE WHEN unassisted_total_attempts > 0 AND unassisted_attempts >= 0 AND unassisted_attempts <= unassisted_total_attempts THEN 100.0 * unassisted_attempts / unassisted_total_attempts ELSE NULL END");
    expect(volumeColumn("unassisted_rate")).toBe("unassisted_total_attempts");
  });

  it("derives assisted make share only from a reconciled make split", () => {
    expect(metricExpression("assisted_make_share")).toBe("CASE WHEN fgm > 0 AND assisted_makes >= 0 AND unassisted_makes >= 0 AND assisted_makes + unassisted_makes = fgm THEN 100.0 * assisted_makes / fgm ELSE NULL END");
    expect(volumeColumn("assisted_make_share")).toBe("fgm");
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
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.fgm')) = COUNT(*)");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.fgm_ast')) = COUNT(*)");
    expect(sql).toContain("COUNT(json_extract(s.stats_json,'$.fgm_unast')) = COUNT(*)");
  });

  it("publishes the assisted make definition and fail-closed qualification", async () => {
    const batch = vi.fn(async () => [
      { results: [{ season: 2026 }] },
      { results: [] },
      { results: [] },
      { results: [] },
    ]);
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&meta=1",
      {},
      { DB: { batch, prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })) } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      metrics: expect.arrayContaining(["assisted_make_share"]),
      metric_definitions: {
        assisted_make_share: {
          definition: "100 × assisted field goals made / total field goals made",
          qualification: "At least 50 total field goals made",
          integrity: "Available only when assisted plus unassisted makes exactly equals total field goals made",
          availability: "D1 player-box archive only; unavailable in the published individual fallback",
        },
      },
    });
  });

  it("enforces the 50-make qualification even when a caller requests no volume floor", async () => {
    const bind = vi.fn((...values: unknown[]) => ({
      first: vi.fn(async () => ({ total: 0, values })),
      all: vi.fn(async () => ({ results: [] })),
    }));
    const prepare = vi.fn(() => ({ bind }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=assisted_make_share&minGames=5&minMinutes=200&minVolume=0",
      {},
      { DB: { prepare } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ metric: "assisted_make_share", min_volume: 50 });
    expect(bind.mock.calls.every((values) => values.includes(50))).toBe(true);
  });

  it("does not fabricate assisted splits from the published individual fallback", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 unavailable"); });
    const fetch = vi.fn();
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=assisted_make_share&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed for impossible field-goal fallback values", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 unavailable"); });
    const base = { division: 1, team_ncaa_id: 42, team_name: "Example U", games: 20, mins: 600 };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { ...base, player_id: 7, name: "Valid", box_sample: { games: 20, mins: 600, fga: 200, fgm: 100 } },
        { ...base, player_id: 8, name: "Impossible", box_sample: { games: 20, mins: 600, fga: 100, fgm: 101 } },
        { ...base, player_id: 9, name: "Missing", box_sample: { games: 20, mins: 600, fga: 100, fgm: null } },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=fg_pct&minGames=5&minMinutes=200&minVolume=100",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      metric: "fg_pct",
      total: 1,
      rows: [{ player_id: "7", value: 50, rank: 1, fga: 200, fgm: 100 }],
    });
  });

  it.each(["ppg", "balanced_index", "impact_index"])("ranks an exact-ID %s comparison against the full qualified cohort", async (metric) => {
    const prepare = vi.fn((_query: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({ total: 0 })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    }));
    const response = await ncaaPlayerRankings.request(
      `/?season=2026&metric=${metric}&playerIds=42,43&minGames=5&minMinutes=200`,
      {},
      { DB: { prepare } } as never,
    );
    expect(response.status).toBe(200);
    const countSql = String(prepare.mock.calls[0]?.[0] || "");
    const rowSql = prepare.mock.calls.map(([query]) => String(query)).find((query) => query.includes("player_id IN (?,?)")) || "";
    expect(rowSql).toContain("player_id IN (?,?)");
    expect(countSql).not.toContain("player_id IN (?,?)");
    const rankAt = rowSql.indexOf("RANK() OVER");
    const cohortFilterAt = rowSql.indexOf("player_id IN (?,?)");
    expect(rankAt).toBeGreaterThan(-1);
    expect(cohortFilterAt).toBeGreaterThan(rankAt);
    expect(rowSql.slice(rankAt, cohortFilterAt)).toContain("FROM eligible WHERE value IS NOT NULL".replace("eligible", metric === "ppg" ? "eligible" : "scored"));
  });

  it("rejects an unbounded or nonnumeric exact-ID list", async () => {
    const prepare = vi.fn();
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ppg&playerIds=42,not-an-id",
      {},
      { DB: { prepare } } as never,
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
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

  it("derives fallback rate boards only from one coherent exact-ID box sample", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const common = { division: 1, team_ncaa_id: 42, team_name: "Example U", games: 30, mins: 900 };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        {
          ...common,
          player_id: 7,
          name: "Mixed Leader",
          pts: 600,
          fga: 120,
          fta: 40,
          box_sample: { games: 10, mins: 300, pts: 100, fga: 100, fta: 40, fgm: 40, tpm: 10 },
        },
        {
          ...common,
          player_id: 8,
          name: "Same Rate",
          pts: 500,
          fga: 100,
          fta: 20,
          box_sample: { games: 10, mins: 300, pts: 100, fga: 100, fta: 40, fgm: 40, tpm: 10 },
        },
        {
          ...common,
          player_id: 9,
          name: "No Coherent Sample",
          pts: 700,
          fga: 100,
          fta: 20,
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ts&minGames=5&minMinutes=200&minVolume=100",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<Record<string, unknown>> };
    expect(body.total).toBe(2);
    expect(body.rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(body.rows[0]).toMatchObject({
      games: 10,
      minutes: 300,
      points: 100,
      fga: 100,
      fta: 40,
      sample_basis: "exact_id_box",
    });
    expect(body.rows[0].value).toBeCloseTo(100 / (2 * (100 + 0.475 * 40)) * 100);
  });

  it("keeps the published exact-ID response ranked against the full cohort", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const player = { division: 1, team_ncaa_id: 42, team_name: "Example U", games: 20, mins: 600 };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2026,
      players: [
        { ...player, player_id: 7, name: "Leader", pts: 400, ppg: 20 },
        { ...player, player_id: 8, name: "Selected", pts: 200, ppg: 10 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await ncaaPlayerRankings.request(
      "/?season=2026&metric=ppg&playerIds=8&minGames=5&minMinutes=200",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } } as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 2,
      rows: [expect.objectContaining({ player_id: "8", rank: 2, value: 10 })],
    });
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
        { ...player, player_id: 7, name: "Missing Threes", tpm: null, box_sample: { ...player, tpm: null } },
        { ...player, player_id: 8, name: "Recorded Threes", tpm: 24, box_sample: { ...player, tpm: 24 } },
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
        { ...player, player_id: 7, name: "Small Sample", tov: 24, box_sample: { ...player, tov: 24 } },
        { ...player, player_id: 8, name: "Qualified Sample", tov: 50, box_sample: { ...player, tov: 50 } },
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
        { ...player, player_id: 7, name: "Qualified", box_sample: { ...player, fgm: 150, fga: 300, tpm: 48, tpa: 120 } },
        { ...player, player_id: 8, name: "Small Sample", box_sample: { ...player, fgm: 70, fga: 150, tpm: 35, tpa: 100 } },
        { ...player, player_id: 9, name: "Missing Three Attempts", box_sample: { ...player, fgm: 120, fga: 240, tpm: 30, tpa: null } },
        { ...player, player_id: 10, name: "Impossible Residual", box_sample: { ...player, fgm: 40, fga: 200, tpm: 48, tpa: 100 } },
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
