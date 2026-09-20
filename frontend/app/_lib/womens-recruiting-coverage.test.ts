import { describe, expect, it } from "vitest";
import { womensRecruitingCoverage } from "./womens-recruiting-coverage";

describe("women's recruiting coverage", () => {
  it("keeps roster context recorded while recruiting events remain unavailable", () => {
    const rows = womensRecruitingCoverage({ rosterRows: 5616, rosterTeams: 400, playerSeasonRows: 41919 });
    expect(rows.map((row) => [row.key, row.status, row.rows])).toEqual([
      ["events", "unavailable", 0],
      ["roster", "recorded", 5616],
      ["production", "recorded", 41919],
    ]);
  });

  it("never turns negative or missing counts into published evidence", () => {
    const rows = womensRecruitingCoverage({ rosterRows: -1, rosterTeams: -2, playerSeasonRows: Number.NaN, recruitingEvents: -4 });
    expect(rows.every((row) => row.rows >= 0)).toBe(true);
    expect(rows.find((row) => row.key === "events")?.status).toBe("unavailable");
    expect(rows.find((row) => row.key === "production")?.status).toBe("unavailable");
  });
});
