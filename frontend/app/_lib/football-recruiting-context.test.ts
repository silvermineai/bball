import { describe, expect, it } from "vitest";
import { mergeFootballRecruitingContext } from "./football-recruiting-context";

describe("football recruiting context", () => {
  it("joins talent and returning production only on exact team IDs", () => {
    const context = mergeFootballRecruitingContext(
      { rows: [{ team_id: "12", team: "Alpha", talent_composite: 88.2, talent_rank: 7, blue_chip_ratio: 0.4, n_recruits: 22 }] },
      { rows: [{ team_id: "12", team: "Different label", off_returning: 0.61, def_returning: 0.52, overall_returning: 0.57, n_returning: 18, is_estimated: false }, { team_id: "99", team: "Alpha", off_returning: 0.8 }] },
    );
    expect(context.get("12")).toMatchObject({ team_id: "12", team: "Alpha", talent_rank: 7, off_returning: 0.61 });
    expect(context.get("99")).toMatchObject({ team_id: "99", team: "Alpha", off_returning: 0.8 });
    expect(context.size).toBe(2);
  });

  it("drops malformed IDs and preserves unavailable fields", () => {
    const context = mergeFootballRecruitingContext({ rows: [{ team_id: "nope", team: "Bad" }, { team_id: "18", team: "Valid", talent_composite: null }] }, { rows: [] });
    expect(context.size).toBe(1);
    expect(context.get("18")?.talent_composite).toBeNull();
  });
});
