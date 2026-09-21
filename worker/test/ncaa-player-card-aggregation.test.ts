import { describe, expect, it } from "vitest";
import { aggregateNcaaPlayerGameStats } from "../src/ncaa-player-card-aggregation";

describe("NCAA player card game-stat aggregation", () => {
  it("sums additive fields and keeps rate fields as coverage only", () => {
    const result = aggregateNcaaPlayerGameStats([
      { contest_id: "a", stats_json: JSON.stringify({ pts: 12, fga: 10, ts_pct: 0.55, pct_fga_trans: 0.2 }) },
      { contest_id: "b", stats_json: JSON.stringify({ pts: 8, fga: 7, ts_pct: 0.6, pct_fga_trans: 0.3 }) },
    ]);
    expect(result).toMatchObject({ rows: 2, contests: 2 });
    expect(result.fields.pts).toEqual({ observed: 2, total: 20 });
    expect(result.fields.fga).toEqual({ observed: 2, total: 17 });
    expect(result.fields.ts_pct).toEqual({ observed: 2, total: null });
    expect(result.fields.pct_fga_trans).toEqual({ observed: 2, total: null });
  });

  it("withholds malformed, missing, and nonnumeric values without inventing zeros", () => {
    const result = aggregateNcaaPlayerGameStats([
      { contest_id: "a", stats_json: JSON.stringify({ pts: 10, ast: null, mins: "30" }) },
      { contest_id: "a", stats_json: "not-json" },
      { contest_id: "b", stats_json: JSON.stringify({ pts: Number.NaN, ast: 4 }) },
    ]);
    expect(result.rows).toBe(2);
    expect(result.contests).toBe(2);
    expect(result.fields.pts).toEqual({ observed: 1, total: 10 });
    expect(result.fields.ast).toEqual({ observed: 1, total: 4 });
    expect(result.fields.mins).toBeUndefined();
  });
});
