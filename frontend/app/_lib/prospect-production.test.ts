import { describe, expect, it } from "vitest";
import { parseProspectProductionRelease } from "./prospect-production";

const payload = (people: unknown[]) => ({
  season: 2027,
  edition: "reviewed-edition",
  reviewed_at: "2026-09-16T00:00:00Z",
  people,
});

const stats = (overrides: Record<string, unknown> = {}) => ({
  id: "5292602",
  team_id: "2550",
  team: "Seton Hall",
  season: 2026,
  games: 31,
  mpg: 17.9,
  ppg: 6.5,
  rpg: 5.5,
  apg: 0.6,
  spg: 0.4,
  bpg: 2.2,
  topg: 0.8,
  efg: 0.6,
  ts: 0.62,
  three_pct: null,
  ft_pct: 0.69,
  ft_rate: 0.43,
  three_rate: 0,
  tov_rate: 0.13,
  incomplete_box_games: 0,
  identity_basis: "Exact source ID and school match",
  ...overrides,
});

describe("prospect production release", () => {
  it("returns exact-ID production and preserves missing metrics", () => {
    const result = parseProspectProductionRelease(
      payload([{ stats: stats() }, { stats: stats({ id: "5292603", ppg: 8.5, games: 30 }) }]),
      2027,
      "5292602",
    );
    expect(result?.production?.team).toBe("Seton Hall");
    expect(result?.production?.games).toBe(31);
    expect(result?.production?.three_pct).toBeNull();
    expect(result?.productionContext.ppg).toEqual({ rank: 2, cohort: 2 });
    expect(result?.productionContext.games).toEqual({ rank: 1, cohort: 2 });
    expect(result?.productionContext.three_pct).toBeUndefined();
  });

  it("returns an explicit unavailable production result when no exact ID exists", () => {
    const result = parseProspectProductionRelease(
      payload([{ stats: stats({ id: "123" }) }]),
      2027,
      "5292602",
    );
    expect(result?.production).toBeNull();
    expect(result?.productionContext).toEqual({});
  });

  it("uses competition ranks with ties and ignores duplicate source IDs", () => {
    const result = parseProspectProductionRelease(
      payload([
        { stats: stats({ ppg: 6.5 }) },
        { stats: stats({ id: "5292603", ppg: 6.5 }) },
        { stats: stats({ id: "5292603", ppg: 99 }) },
        { stats: stats({ id: "not-a-source-id", ppg: 100 }) },
      ]),
      2027,
      "5292602",
    );
    expect(result?.productionContext.ppg).toEqual({ rank: 1, cohort: 2 });
  });

  it("rejects a season mismatch or malformed candidate", () => {
    expect(parseProspectProductionRelease(payload([{ stats: stats() }]), 2026, "5292602")).toBeNull();
    expect(parseProspectProductionRelease(payload([{ stats: stats({ mpg: "17.9" }) }]), 2027, "5292602")).toBeNull();
  });

  it("withholds duplicate exact IDs instead of picking one", () => {
    const result = parseProspectProductionRelease(
      payload([{ stats: stats() }, { stats: stats() }]),
      2027,
      "5292602",
    );
    expect(result).toBeNull();
  });
});
