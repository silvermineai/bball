import { describe, expect, it } from "vitest";
import {
  formatWomensPlayerStat,
  unlistedWomensPlayerFields,
  womensPlayerDetailCount,
  womensPlayerDetailGroups,
  paginateWomensPlayerRows,
  orderedWomensPlayerStatFields,
  womensPlayerCsvHeaders,
  womensPlayerCsvRows,
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

  it("pages the complete retained player cohort without dropping rows", () => {
    const rows = Array.from({ length: 205 }, (_, index) => index);
    expect(paginateWomensPlayerRows(rows, 0)).toHaveLength(100);
    expect(paginateWomensPlayerRows(rows, 2)).toEqual([200, 201, 202, 203, 204]);
    expect(paginateWomensPlayerRows(rows, -1)).toEqual(rows.slice(0, 100));
    expect(paginateWomensPlayerRows(rows, 0, 0)).toEqual([]);
  });

  it("exports every retained field while preserving unavailable values as blanks", () => {
    const players = [
      { player_id: "1", name: "A Player", team: "North", position: "G", source: "season" as const, stats: { points: 10, futureMetric: Number.NaN } },
      { player_id: "2", name: "B Player", team: "South", position: "G", source: "box" as const, box_rows: 3, dnp_rows: 1, stats: { avgPoints: 8.5, assists: null } },
    ];
    const fields = orderedWomensPlayerStatFields(players);
    expect(fields).toEqual(["avgPoints", "points", "assists", "futureMetric"]);
    expect(womensPlayerCsvHeaders(fields).slice(0, 7)).toEqual(["Player ID", "Player", "Team", "Position", "Source", "Box rows", "DNP rows"]);
    expect(womensPlayerCsvRows(players, fields)).toEqual([
      ["1", "A Player", "North", "G", "season", null, null, null, 10, null, null],
      ["2", "B Player", "South", "G", "box", 3, 1, 8.5, null, null, null],
    ]);
  });
});
