import { describe, expect, it } from "vitest";
import {
  filterWomensRankingRows,
  paginateWomensRankingRows,
  womensRankingCountLabel,
  womensRankingSampleLabel,
  type WomensRankingRow,
} from "./womens-rankings-view";

const rows: WomensRankingRow[] = [
  { rank: 1, name: "Ava Guard", team: "North State", player_id: "101" },
  { rank: 2, name: "Maya Wing", team: "South State", player_id: "102" },
  { rank: 3, name: "Lena Post", team: "North State", player_id: "103" },
];

describe("women's ranking board view", () => {
  it("filters by player, team, or source player ID without renumbering", () => {
    expect(filterWomensRankingRows(rows, "north state").map((row) => row.rank)).toEqual([1, 3]);
    expect(filterWomensRankingRows(rows, "102")).toEqual([rows[1]]);
    expect(filterWomensRankingRows(rows, "")).toBe(rows);
  });

  it("paginates the full board and preserves global ranks", () => {
    expect(paginateWomensRankingRows(rows, 0, 2)).toEqual([rows[0], rows[1]]);
    expect(paginateWomensRankingRows(rows, 1, 2)).toEqual([rows[2]]);
    expect(paginateWomensRankingRows(rows, -1, 2)).toEqual([rows[0], rows[1]]);
  });

  it("shows a ranking denominator only when it clears the published floor", () => {
    const board = { min_sample: 100, sample_unit: "FGA + 0.475 × FTA" };
    expect(womensRankingSampleLabel({ sample: 238 }, board)).toBe("238 FGA + 0.475 × FTA");
    expect(womensRankingSampleLabel({ sample: 99.9 }, board)).toBeNull();
    expect(womensRankingSampleLabel({}, board)).toBeNull();
  });

  it("keeps missing coverage distinct from a recorded zero", () => {
    expect(womensRankingCountLabel(0)).toBe("0");
    expect(womensRankingCountLabel(41919)).toBe("41,919");
    expect(womensRankingCountLabel(null)).toBe("Unavailable");
    expect(womensRankingCountLabel(undefined)).toBe("Unavailable");
    expect(womensRankingCountLabel(-1)).toBe("Unavailable");
  });
});
