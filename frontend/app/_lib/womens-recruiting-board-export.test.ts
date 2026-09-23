import { describe, expect, it } from "vitest";
import { womensRecruitingBoardCsvHeaders, womensRecruitingBoardCsvRows } from "./womens-recruiting-board-export";
import type { WomensRecruitingRelease } from "./womens-recruiting-intel";

const release = {
  season: 2027,
  edition: "a".repeat(64),
  captured_at: "2026-09-22T00:00:00Z",
  source: { list_sha256: "b".repeat(64) },
} as WomensRecruitingRelease;

describe("women's recruiting board export", () => {
  it("keeps every source rank dimension alongside existing recruiting fields", () => {
    const rankColumns = ["National rank", "Position rank", "State rank", "Region rank"];
    expect([...womensRecruitingBoardCsvHeaders]).toEqual(expect.arrayContaining(rankColumns));
    const row = womensRecruitingBoardCsvRows([{
      athlete_id: "17",
      name: "A Prospect",
      position: "G",
      rank: 42,
      position_rank: 7,
      state_rank: 3,
      region_rank: 12,
      grade: 92,
      height_inches: 70,
      weight_pounds: 150,
    }], release)[0];
    expect(row.slice(4, 9)).toEqual([42, 7, 3, 12, 92]);
    expect(row.slice(-3)).toEqual([release.edition, release.captured_at, release.source.list_sha256]);
  });

  it("preserves missing rank values instead of filling them", () => {
    const row = womensRecruitingBoardCsvRows([{ athlete_id: "18", name: "Unranked" }], release)[0];
    expect(row.slice(4, 9)).toEqual([null, null, null, null, null]);
  });
});
