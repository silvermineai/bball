import { describe, expect, it } from "vitest";
import { buildUpcomingFactorStudy } from "./upcoming-game-factors";

const factors = {
  season: 2026,
  factors: {
    efg: { home_offense: 0.54, home_defense: 0.49, away_offense: 0.51, away_defense: 0.52 },
    tov: { home_offense: 0.16, home_defense: 0.18, away_offense: 0.2, away_defense: 0.15 },
  },
  edges: { efg: 0.03, tov: -0.02 },
};

describe("upcoming game factor study", () => {
  it("keeps finite rates and edges in the source order", () => {
    const result = buildUpcomingFactorStudy({
      matchup_factors: factors,
      matchup_factors_model_id: "factor-edition",
      matchup_factors_same_edition: true,
    });
    expect(result.lineage).toBe("same-edition");
    expect(result.season).toBe(2026);
    expect(result.modelId).toBe("factor-edition");
    expect(result.rows.map((row) => row.key)).toEqual(["efg", "tov", "orb", "ftr"]);
    expect(result.rows[0]).toMatchObject({ edge: 0.03, homeOffense: 0.54, awayDefense: 0.52 });
    expect(result.rows[0].question).toContain("efficient looks");
  });

  it("labels context from another edition and withholds malformed values", () => {
    const result = buildUpcomingFactorStudy({
      matchup_factors: {
        ...factors,
        factors: { efg: { home_offense: Number.NaN, home_defense: 0.49, away_offense: 0.51, away_defense: 0.52 } },
        edges: { efg: Infinity },
      },
      matchup_factors_model_id: "older-edition",
      matchup_factors_same_edition: false,
    });
    expect(result.lineage).toBe("other-edition");
    expect(result.rows[0]).toMatchObject({ edge: null, homeOffense: null, homeDefense: 0.49 });
  });

  it("returns four explicit unavailable rows when factor context is absent", () => {
    const result = buildUpcomingFactorStudy({
      matchup_factors: null,
      matchup_factors_model_id: null,
      matchup_factors_same_edition: null,
    });
    expect(result.lineage).toBe("unavailable");
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((row) => row.edge === null && row.homeOffense === null)).toBe(true);
  });
});
