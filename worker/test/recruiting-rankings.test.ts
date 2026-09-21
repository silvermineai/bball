import { describe, expect, it, vi } from "vitest";
import { recruitingRankings } from "../src/recruiting-rankings";

describe("ESPN recruiting rankings", () => {
  it("publishes a reconciled position opportunity aggregate for the active cohort", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("WITH cohort_rows")
            ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
            : sql.includes("count(*)")
              ? { total: 8, committed_total: 3, ranked_total: 6, grade_total: 7 }
              : { edition: "edition-1", captured_at: "2026-09-18T00:00:00Z" }),
          all: vi.fn(async () => ({ results: sql.includes("AS uncommitted_top100_total")
            ? [{
                position: "PG", total: 8, committed_total: 3, uncommitted_total: 5,
                ranked_total: 6, top100_total: 4, uncommitted_ranked_total: 4,
                uncommitted_top100_total: 3, best_uncommitted_rank: 12,
                average_uncommitted_grade: 93.25,
              }]
            : [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { position_opportunity: Array<Record<string, unknown>> };
    expect(body.position_opportunity).toEqual([{
      position: "PG",
      total: 8,
      committed_total: 3,
      uncommitted_total: 5,
      ranked_total: 6,
      top100_total: 4,
      uncommitted_ranked_total: 4,
      uncommitted_top100_total: 3,
      best_uncommitted_rank: 12,
      average_uncommitted_grade: 93.25,
    }]);
    const query = sqlCalls.find((sql) => sql.includes("AS uncommitted_top100_total"));
    expect(query).toContain("r.edition=c.edition");
    expect(query).toContain("NULLIF(TRIM(CAST(r.committed_team_id AS TEXT)),'') IS NULL");
    expect(query).toContain("r.grade IS NOT NULL AND r.grade>0");
  });

  it("returns an edition-bound, mutually exclusive rank landscape", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("AS top_10")
            ? { top_10: 1, ranks_11_25: 1, ranks_26_50: 1, ranks_51_100: 1, ranks_101_plus: 1, unranked: 1 }
            : sql.includes("WITH cohort_rows")
              ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
              : sql.includes("count(*)")
                ? { total: 6, committed_total: 2, ranked_total: 5, grade_total: 6 }
                : { edition: "edition-1", captured_at: "2026-09-18T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { rank_distribution: Array<{ key: string; total: number; min_rank: number | null; max_rank: number | null }> };
    expect(response.status).toBe(200);
    expect(body.rank_distribution).toEqual([
      { key: "top_10", label: "Top 10", min_rank: 1, max_rank: 10, total: 1 },
      { key: "ranks_11_25", label: "11–25", min_rank: 11, max_rank: 25, total: 1 },
      { key: "ranks_26_50", label: "26–50", min_rank: 26, max_rank: 50, total: 1 },
      { key: "ranks_51_100", label: "51–100", min_rank: 51, max_rank: 100, total: 1 },
      { key: "ranks_101_plus", label: "101+", min_rank: 101, max_rank: null, total: 1 },
      { key: "unranked", label: "Rank unavailable", min_rank: null, max_rank: null, total: 1 },
    ]);
    const distributionQuery = sqlCalls.find((sql) => sql.includes("AS top_10"));
    expect(distributionQuery).toContain("r.edition=c.edition");
    expect(distributionQuery).toContain("WHERE r.season=?");
  });

  it("returns source-labeled ranked prospects with parsed school IDs", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("WITH cohort_rows") ? { tied_rank_values: 1, tied_rows: 2, withheld_placeholder_rows: 0 } : sql.includes("count(*)") ? { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
        all: vi.fn(async () => ({ results: sql.includes("COALESCE(NULLIF(upper(r.position)") ? [{ team_id: "2755", position: "PG", total: 1 }] : sql.includes("CAST(r.committed_team_id AS TEXT)") ? [{ team_id: "2755", team: "PG", total: 1, ranked_total: 1, top100_total: 1, source_rank_points: 1, best_rank: 1, average_rank: 1 }] : sql.includes("GROUP BY") ? [{ position: "PG", total: 1 }] : [{ athlete_id: "272415", name: "Danny Abass", rank: 225, committed_team_id: "2755", school_ids_json: '["257","526"]' }] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; cohort: { committed: number; ranked: number; graded: number }; rank_quality: { tied_rank_values: number; tied_rows: number; withheld_placeholder_rows: number }; position_breakdown: Array<{ position: string; total: number }>; commitment_destinations: Array<{ team_id: string | null; team: string; total: number; ranked_total: number; top100_total: number; source_rank_points: number; best_rank: number | null; average_rank: number | null; position_breakdown: Array<{ position: string; total: number }> }>; rows: Array<{ name: string; school_ids: string[]; school_ids_json?: string }> };
    expect(body.total).toBe(1);
    expect(body.cohort).toEqual({ committed: 1, ranked: 1, graded: 1 });
    expect(body.rank_quality).toEqual({ ranked_rows: 1, tied_rank_values: 1, tied_rows: 2, withheld_placeholder_rows: 0 });
    expect(body.position_breakdown).toEqual([{ position: "PG", total: 1 }]);
    expect(body.commitment_destinations).toEqual([{ team_id: "2755", team: "PG", total: 1, ranked_total: 1, top100_total: 1, source_rank_points: 1, best_rank: 1, average_rank: 1, position_breakdown: [{ position: "PG", total: 1 }] }]);
    expect(body.rows[0]).toEqual(expect.objectContaining({ name: "Danny Abass", committed_team_id: "2755", school_ids: ["257", "526"] }));
    expect(body.rows[0].school_ids_json).toBeUndefined();
  });

  it("publishes the release edition digest when retained row hashes legitimately differ", async () => {
    const editionSha256 = "b".repeat(64);
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("SELECT edition")
          ? { edition: editionSha256, captured_at: "2026-09-12T00:00:00Z", source_rows: 2, invalid_source_hashes: 0 }
          : sql.includes("WITH cohort_rows")
            ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
            : sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
        all: vi.fn(async () => ({ results: [] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { source_receipt: { dataset: string; source_rows: number; sha256: string | null; sha256_scope: string; integrity: string } };
    expect(body.source_receipt).toEqual({ dataset: "recruiting_rankings", captured_at: "2026-09-12T00:00:00Z", source_rows: 2, sha256: editionSha256, sha256_scope: "release_edition", integrity: "verified" });
  });

  it.each([
    { label: "the release edition", edition: "edition-1", invalid_source_hashes: 0 },
    { label: "a retained row hash", edition: "c".repeat(64), invalid_source_hashes: 1 },
  ])("withholds the receipt when $label is malformed", async ({ edition, invalid_source_hashes }) => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("SELECT edition")
          ? { edition, captured_at: "2026-09-12T00:00:00Z", source_rows: 2, invalid_source_hashes }
          : sql.includes("WITH cohort_rows")
            ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
            : sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
        all: vi.fn(async () => ({ results: [] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { source_receipt: { sha256: string | null; sha256_scope: string; integrity: string } };
    expect(body.source_receipt).toEqual({ dataset: "recruiting_rankings", captured_at: "2026-09-12T00:00:00Z", source_rows: 2, sha256: null, sha256_scope: "unavailable", integrity: "unavailable" });
  });

  it("keeps provider receipts out of the public response", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("WITH cohort_rows") ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 } : sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-01T00:00:00Z" }),
        all: vi.fn(async () => ({ results: [] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("ESPN Recruiting");
    expect(body).not.toContain("sports.core.api.espn.com");
  });

  it("publishes cohort identity-shape flags without changing the source rows", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("duplicate_name_groups")
            ? {
                blank_name_rows: 1,
                invalid_athlete_id_rows: 0,
                committed_id_without_name: 2,
                committed_name_without_id: 1,
                duplicate_name_groups: 3,
                duplicate_name_rows: 7,
                malformed_school_list_rows: 1,
                non_array_school_list_rows: 1,
                duplicate_school_id_rows: 2,
              }
            : sql.includes("WITH cohort_rows")
              ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
              : sql.includes("count(*)")
                ? { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 }
                : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { identity_quality: Record<string, number> };
    expect(response.status).toBe(200);
    expect(body.identity_quality).toEqual({
      blank_name_rows: 1,
      invalid_athlete_id_rows: 0,
      committed_id_without_name: 2,
      committed_name_without_id: 1,
      duplicate_name_groups: 3,
      duplicate_name_rows: 7,
      malformed_school_list_rows: 1,
      non_array_school_list_rows: 1,
      duplicate_school_id_rows: 2,
    });
    const identityQuery = sqlCalls.find((sql) => sql.includes("duplicate_name_groups"));
    expect(identityQuery).toContain("r.edition=c.edition");
    expect(identityQuery).toContain("count(DISTINCT athlete_id)");
    expect(identityQuery).toContain("json_each(school_ids_json)");
  });

  it("orders commitment destinations by transparent source-rank points", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const destinationSql = sqlCalls.find((sql) => sql.includes("GROUP BY CAST(r.committed_team_id"));
    expect(destinationSql).toContain("ORDER BY source_rank_points DESC");
  });

  it("exposes an explicit long-tail destination bound and completeness signal", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn(async () => sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => sql.includes("destination_total") ? {
            results: [{ team_id: "2755", team: "Example", total: 1, ranked_total: 1, top100_total: 1, source_rank_points: 100, best_rank: 1, average_rank: 1, destination_total: 201 }],
          } : { results: [] }),
          args,
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0&destination_limit=200", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { destination_coverage: { returned: number; total: number; limit: number; complete: boolean } };
    expect(response.status).toBe(200);
    expect(body.destination_coverage).toEqual({ returned: 1, total: 201, limit: 200, complete: false });
    const destinationSql = sqlCalls.find((sql) => sql.includes("destination_total"));
    expect(destinationSql).toContain("LIMIT ?");
    const destinationBind = (prepare.mock.results[sqlCalls.indexOf(destinationSql!)].value.bind as ReturnType<typeof vi.fn>);
    expect(destinationBind.mock.calls.at(-1)).toContain(200);
  });

  it("aggregates exact school-list IDs inside the current edition", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("count(*)")
            ? { total: 1, committed_total: 0, ranked_total: 1, grade_total: 1 }
            : { edition: "edition-1", captured_at: "2026-09-19T00:00:00Z" }),
          all: vi.fn(async () => ({ results: sql.includes("AS prospect_total")
            ? [{ edition: "edition-1", school_id: "150", prospect_total: 8, uncommitted_total: 5, committed_here_total: 2, ranked_total: 7, top100_total: 4, best_rank: 8, average_rank: 73.4 }]
            : sql.includes("SELECT edition,school_id,position")
              ? [{ edition: "edition-1", school_id: "150", position: "PG", total: 8 }]
              : [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { recorded_school_programs: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(body.recorded_school_programs).toEqual([{
      edition: "edition-1",
      school_id: "150",
      prospect_total: 8,
      uncommitted_total: 5,
      committed_here_total: 2,
      ranked_total: 7,
      top100_total: 4,
      best_rank: 8,
      average_rank: 73.4,
      position_breakdown: [{ position: "PG", total: 8 }],
    }]);
    const aggregate = sqlCalls.find((sql) => sql.includes("AS prospect_total"));
    expect(aggregate).toContain("SELECT DISTINCT c.edition,r.athlete_id");
    expect(aggregate).toContain("r.edition=c.edition");
    expect(aggregate).toContain("NULLIF(TRIM(CAST(committed_team_id AS TEXT)),'') IS NULL");
    expect(aggregate).toContain("TRIM(CAST(committed_team_id AS TEXT))=school_id");
  });

  it("fails closed with a 200 unavailable response when D1 is unavailable", async () => {
    const response = await recruitingRankings.request("/?season=2027", {}, { RESEARCH_DB: { prepare: vi.fn(() => { throw new Error("busy"); }) } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ source: "unavailable", rows: [] }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("supports exact athlete lookups for stable prospect dossiers", async () => {
    const bind = vi.fn(() => ({
      first: vi.fn(async () => ({ total: 1, committed_total: 0, ranked_total: 1, grade_total: 1 })),
      all: vi.fn(async () => ({ results: [{ athlete_id: "272415", name: "Danny Abass", rank: 225, school_ids_json: "[]" }] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&athlete_id=272415&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls[0]).toContain("r.athlete_id=?");
    expect(bind.mock.calls[0]).toContain("272415");
    expect((await response.json() as { total: number }).total).toBe(1);
  });

  it("adds an unfiltered same-edition class denominator to exact athlete responses", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn(async () => sql.includes("AS class_total")
            ? { class_total: 383, class_committed_total: 132, class_ranked_total: 301, class_grade_total: 302 }
            : sql.includes("WITH cohort_rows")
              ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
              : sql.includes("SELECT edition")
                ? { edition: "edition-1", captured_at: "2026-09-19T00:00:00Z" }
                : { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 }),
          all: vi.fn(async () => ({ results: sql.includes("SELECT r.athlete_id")
            ? [{ athlete_id: "260236", name: "Oneal Delancy", rank: 36, school_ids_json: "[]" }]
            : [] })),
          args,
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&athlete_id=260236&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { total: number; cohort: { ranked: number }; class_context: { total: number; committed: number; ranked: number; graded: number } };

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.cohort.ranked).toBe(1);
    expect(body.class_context).toEqual({ total: 383, committed: 132, ranked: 301, graded: 302 });
    const contextQuery = prepare.mock.calls.find(([sql]) => String(sql).includes("AS class_total"));
    expect(contextQuery?.[0]).toContain("WHERE r.season=? AND r.edition=c.edition");
  });

  it("adds raw same-position peer counts to an exact athlete response", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn(async () => sql.includes("AS peer_total")
            ? {
                athlete_id: "260236", position: "SF", edition: "edition-1",
                target_height_inches: 79, target_weight_pounds: 205,
                peer_total: 84, position_ranked_total: 61,
                height_recorded: 72, height_below: 50, height_equal: 8, average_height_inches: 77.4,
                weight_recorded: 70, weight_below: 43, weight_equal: 5, average_weight_pounds: 196.2,
              }
            : sql.includes("AS class_total")
              ? { class_total: 383, class_committed_total: 132, class_ranked_total: 301, class_grade_total: 302 }
              : sql.includes("WITH cohort_rows")
                ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 0 }
                : sql.includes("SELECT edition")
                  ? { edition: "edition-1", captured_at: "2026-09-19T00:00:00Z" }
                  : { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 }),
          all: vi.fn(async () => ({ results: sql.includes("SELECT r.athlete_id")
            ? [{ athlete_id: "260236", name: "Oneal Delancy", position: "SF", height_inches: 79, weight_pounds: 205, rank: 36, school_ids_json: "[]" }]
            : [] })),
          args,
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&athlete_id=260236&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { peer_context: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.peer_context).toEqual({
      season: 2027,
      athlete_id: "260236",
      edition: "edition-1",
      position: "SF",
      target_height_inches: 79,
      target_weight_pounds: 205,
      peers: 84,
      position_ranked: 61,
      height_recorded: 72,
      height_below: 50,
      height_equal: 8,
      average_height_inches: 77.4,
      weight_recorded: 70,
      weight_below: 43,
      weight_equal: 5,
      average_weight_pounds: 196.2,
    });
    const peerQuery = sqlCalls.find((sql) => sql.includes("AS peer_total"));
    expect(peerQuery).toContain("r.edition=t.edition");
    expect(peerQuery).toContain("NULLIF(upper(trim(r.position)),'')=t.position");
  });

  it("filters a program prospect board by exact retained school or commitment ID", async () => {
    const bind = vi.fn(() => ({
      first: vi.fn(async () => ({ total: 2, committed_total: 1, ranked_total: 2, grade_total: 2 })),
      all: vi.fn(async () => ({ results: [] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&team_id=2755&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls[0]).toContain("CAST(r.committed_team_id AS TEXT)=?");
    expect(sqlCalls[0]).toContain("json_each(CASE WHEN json_valid(r.school_ids_json)");
    expect(bind.mock.calls[0]).toEqual([2027, "2755", "2755"]);
  });

  it("normalizes blank commitment IDs for committed filters and cohort counts", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });

    await recruitingRankings.request("/?season=2027&committed=yes&page=0", {}, { RESEARCH_DB: { prepare } });
    const committedBoundary = "NULLIF(TRIM(CAST(r.committed_team_id AS TEXT)),'') IS NOT NULL";
    const uncommittedBoundary = "NULLIF(TRIM(CAST(r.committed_team_id AS TEXT)),'') IS NULL";
    expect(sqlCalls.some((sql) => sql.includes(committedBoundary))).toBe(true);

    sqlCalls.length = 0;
    await recruitingRankings.request("/?season=2027&committed=no&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(sqlCalls.some((sql) => sql.includes(uncommittedBoundary))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("r.committed_team_id IS NULL"))).toBe(false);
  });

  it("returns the complete retained rank history for an exact athlete lookup", async () => {
    const history = [
      { edition: "august", captured_at: "2026-08-01T00:00:00Z", rank: 42, grade: 96, status: "", committed_team_id: null, committed_team_name: null, source_url: "https://espn.test/42" },
      { edition: "september", captured_at: "2026-09-01T00:00:00Z", rank: 31, grade: 97, status: "", committed_team_id: "2755", committed_team_name: "Example", source_url: "https://espn.test/31" },
    ];
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("ORDER BY captured_at ASC")) return { bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: history })) })) };
      if (sql.includes("SELECT r.athlete_id,r.name")) return { bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: [{ athlete_id: "272415", name: "Danny Abass", rank: 31, school_ids_json: "[]" }] })) })) };
      if (sql.includes("WITH current_rows")) return { bind: vi.fn(() => ({ first: vi.fn(async () => ({ total: 1, new_to_release: 0, moved_up: 1, moved_down: 0, unchanged: 0, rank_unavailable: 0 })) })) };
      return { bind: vi.fn(() => ({ first: vi.fn(async () => sql.includes("bb_espn_recruiting_current") && sql.includes("SELECT edition") ? { edition: "september", captured_at: "2026-09-01T00:00:00Z" } : sql.includes("count(*)") ? { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 } : { tied_rank_values: 0, tied_rows: 0 }), all: vi.fn(async () => ({ results: [] })) })) };
    });
    const response = await recruitingRankings.request("/?season=2027&athlete_id=272415&history=1&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { history: Array<{ edition: string; rank: number | null }> };
    expect(body.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ edition: "august", rank: 42 }),
      expect.objectContaining({ edition: "september", rank: 31 }),
    ]));
  });

  it("escapes wildcard characters in prospect searches", async () => {
    const bind = vi.fn(() => ({
      first: vi.fn(async () => ({ total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 })),
      all: vi.fn(async () => ({ results: [] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&q=100%25_under&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("ESCAPE '\\'"))).toBe(true);
    expect(bind.mock.calls.some((args) => args.some((value) => value === "%100\\%\\_under%"))).toBe(true);
  });

  it("withholds non-positive retained ranks from public rank filters", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&rank_max=25&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("r.rank <= 0") && sql.includes("ELSE r.rank END"))).toBe(true);
  });

  it("applies a bounded source-rank cutoff", async () => {
    const bind = vi.fn((..._args: unknown[]) => ({
      first: vi.fn(async () => ({ total: 27, committed_total: 10, ranked_total: 27, grade_total: 27 })),
      all: vi.fn(async () => ({ results: [] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&rank_max=25&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("r.grade = 0") && sql.includes("ELSE r.rank END<=?"))).toBe(true);
    expect(bind.mock.calls.some((args) => args.includes(25))).toBe(true);
    expect((await response.json() as { total: number }).total).toBe(27);
  });

  it("returns release-to-release movement alongside the current row", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WITH current_rows")) return {
        bind: vi.fn(() => ({ first: vi.fn(async () => ({ total: 3, new_to_release: 1, moved_up: 1, moved_down: 1, unchanged: 0, rank_unavailable: 0 })) })),
      };
      if (sql.includes("SELECT r.athlete_id")) return {
        bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: [{ athlete_id: "7", name: "Ava Example", rank: 12, previous_rank: 18, previous_captured_at: "2026-08-01T00:00:00Z", school_ids_json: "[]" }] })) })),
      };
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({ total: 1, committed_total: 0, ranked_total: 1, grade_total: 1 })),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { rank_movement: { moved_up: number; moved_down: number; new_to_release: number }; rows: Array<{ previous_rank: number; previous_captured_at: string }> };
    expect(body.rank_movement).toEqual(expect.objectContaining({ moved_up: 1, moved_down: 1, new_to_release: 1 }));
    expect(body.rows[0]).toEqual(expect.objectContaining({ previous_rank: 18, previous_captured_at: "2026-08-01T00:00:00Z" }));
  });

  it("adds an exact release movement filter to the bounded query", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&movement=up&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("ELSE r.rank END < (SELECT CASE WHEN p.rank"))).toBe(true);
  });

  it("withholds ungraded placeholder ranks throughout the public ranking queries", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("WITH cohort_rows")
            ? { tied_rank_values: 0, tied_rows: 0, withheld_placeholder_rows: 2 }
            : sql.includes("count(*)")
              ? { total: 2, committed_total: 2, ranked_total: 0, grade_total: 0 }
              : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: sql.includes("SELECT r.athlete_id")
            ? [{ athlete_id: "273695", name: "Placeholder Example", rank: null, grade: 0, position_rank: null, state_rank: null, region_rank: null, school_ids_json: "[]" }]
            : [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    const body = await response.json() as { cohort: { ranked: number }; rank_quality: { withheld_placeholder_rows: number }; rows: Array<{ rank: number | null }> };

    expect(response.status).toBe(200);
    expect(body.cohort.ranked).toBe(0);
    expect(body.rank_quality.withheld_placeholder_rows).toBe(2);
    expect(body.rows[0].rank).toBeNull();
    expect(sqlCalls.some((sql) => sql.includes("CASE WHEN r.rank IS NULL OR r.rank <= 0") && sql.includes("AS rank"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("CASE WHEN p.rank IS NULL OR p.rank <= 0"))).toBe(true);
  });
});
