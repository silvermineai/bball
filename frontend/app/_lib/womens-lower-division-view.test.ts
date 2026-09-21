import { describe, expect, it } from "vitest";
import {
  filterWomensLowerDivisionRows,
  lowerDivisionCellValue,
  lowerDivisionGames,
  paginateWomensLowerDivisionRows,
} from "./womens-lower-division-view";

const rows = [
  { rank: 1, name: "Ari Jones", team: "North College", g: 18, source_fields: { Name: "Ari Jones", Team: "North College", G: "18" } },
  { rank: 2, name: "Bea Smith", team: "South College", g: 9, source_fields: { Name: "Bea Smith", Team: "South College", G: "9" } },
  { rank: 3, name: "Cam Lee", team: "East College", g: 22, source_fields: { Name: "Cam Lee", Team: "East College", G: "22" } },
];

describe("women's lower-division source row view", () => {
  it("searches retained source values and preserves publisher order", () => {
    expect(filterWomensLowerDivisionRows(rows, "south").map((row) => row.rank)).toEqual([2]);
    expect(filterWomensLowerDivisionRows(rows, "college").map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("uses the source games field for an exact minimum-games filter", () => {
    expect(filterWomensLowerDivisionRows(rows, "", 10).map((row) => row.rank)).toEqual([1, 3]);
    expect(lowerDivisionGames({ team: "A", gm: "12", source_fields: { GM: "12" } })).toBe(12);
    expect(lowerDivisionGames({ team: "A", source_fields: { GM: "—" } })).toBeNull();
  });

  it("renders the retained source value for headers whose normalized key differs", () => {
    const row = { fg: 50.41, source_fields: { "FG%": "50.41", "Points Per Game": "18.2" } };
    expect(lowerDivisionCellValue(row, "FG%")).toBe("50.41");
    expect(lowerDivisionCellValue(row, "Points Per Game")).toBe("18.2");
    expect(lowerDivisionCellValue(row, "FGM")).toBeUndefined();
  });

  it("paginates without changing the source row objects", () => {
    expect(paginateWomensLowerDivisionRows(rows, 0, 2).map((row) => row.rank)).toEqual([1, 2]);
    expect(paginateWomensLowerDivisionRows(rows, 1, 2).map((row) => row.rank)).toEqual([3]);
    expect(paginateWomensLowerDivisionRows(rows, -1, 2).map((row) => row.rank)).toEqual([1, 2]);
  });
});
