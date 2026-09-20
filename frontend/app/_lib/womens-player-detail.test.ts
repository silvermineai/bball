import { describe, expect, it } from "vitest";
import {
  formatWomensPlayerStat,
  unlistedWomensPlayerFields,
  womensPlayerDetailCount,
  womensPlayerDetailGroups,
} from "./womens-player-detail";

describe("women's player retained detail", () => {
  it("catalogs production, efficiency, and discipline fields from the source row", () => {
    const keys = womensPlayerDetailGroups.flatMap((group) => group.fields.map(([key]) => key));
    expect(keys).toEqual(expect.arrayContaining([
      "points", "totalRebounds", "avgTurnovers", "fieldGoalPct",
      "assistTurnoverRatio", "doubleDouble", "technicalFouls",
    ]));
  });

  it("formats percentages and leaves absent or non-finite values unavailable", () => {
    const stats = { fieldGoalPct: 47.25, points: null, assists: Number.NaN };
    expect(formatWomensPlayerStat(stats, "fieldGoalPct", "percentage")).toBe("47.3%");
    expect(formatWomensPlayerStat(stats, "points", "count")).toBe("—");
    expect(formatWomensPlayerStat(stats, "assists", "count")).toBe("—");
  });

  it("counts future source fields without hiding them from the record", () => {
    const stats = { points: 10, futureMetric: 3, missingMetric: null };
    expect(womensPlayerDetailCount(stats)).toBe(2);
    expect(unlistedWomensPlayerFields(stats)).toEqual(["futureMetric", "missingMetric"]);
  });
});
