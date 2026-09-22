import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  filterWomensRankingRows,
  parseWomensRankingPublication,
  paginateWomensRankingRows,
  womensRankingCountLabel,
  womensRankingSampleLabel,
  womensPlayerShotMapHref,
  womensPlayerTableHref,
  type WomensRankingRow,
} from "./womens-rankings-view";

const rows: WomensRankingRow[] = [
  { rank: 1, name: "Ava Guard", team: "North State", player_id: "101" },
  { rank: 2, name: "Maya Wing", team: "South State", player_id: "102" },
  { rank: 3, name: "Lena Post", team: "North State", player_id: "103" },
];

describe("women's ranking board view", () => {
  it("accepts the checked-in women’s D1 release and its box archive", () => {
    const edition = JSON.parse(readFileSync(new URL("../../public/data/basketball/womens-rankings.json", import.meta.url), "utf8")) as unknown;
    const parsed = parseWomensRankingPublication(edition);
    expect(parsed.gender).toBe("women");
    expect(parsed.leaderboards.scoring.rows.length).toBe(parsed.coverage.scoring.qualified);
    expect(parsed.box_archive?.leaderboards.true_shooting.rows.length).toBe(parsed.box_archive?.coverage_by_metric.true_shooting.qualified);
  });

  it("fails closed on cross-scope, duplicate-player, and coverage-corrupt releases", () => {
    const edition = JSON.parse(readFileSync(new URL("../../public/data/basketball/womens-rankings.json", import.meta.url), "utf8")) as Record<string, any>;
    expect(() => parseWomensRankingPublication({ ...edition, gender: "men" })).toThrow(/scope or schema version/);
    const scoring = edition.leaderboards.scoring;
    expect(() => parseWomensRankingPublication({
      ...edition,
      leaderboards: { ...edition.leaderboards, scoring: { ...scoring, rows: [scoring.rows[0], scoring.rows[0]] } },
    })).toThrow(/row 2 is invalid/);
    expect(() => parseWomensRankingPublication({
      ...edition,
      coverage: { ...edition.coverage, scoring: { ...edition.coverage.scoring, qualified: 1 } },
    })).toThrow(/row count does not match/);
  });

  it("hands an exact source player ID to the women’s production table", () => {
    expect(womensPlayerTableHref("5239100")).toBe("/basketball/players/?gender=women&division=1&q=5239100");
  });

  it("opens the exact player file at the reviewable shot map", () => {
    expect(womensPlayerShotMapHref("athlete 42")).toBe("/basketball/womens-player/?id=athlete%2042#wbb-shot-map-title");
  });

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
