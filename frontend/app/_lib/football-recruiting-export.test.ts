import { describe, expect, it } from "vitest";
import { footballRecruitingCsv, footballRecruitingExportHeaders } from "./football-recruiting-export";

describe("football recruiting export", () => {
  it("keeps stable IDs, scope, and missing source fields traceable", () => {
    const csv = footballRecruitingCsv("rosters", [{
      id: "42",
      name: "A Player, Jr.",
      team_id: "7",
      team: "Example U",
      division: "D2",
      position: "QB",
      height: null,
      weight: 210,
      record_key: "rosters:2026:42",
    }], 2026);
    expect(csv).toContain("season,athlete_id,name,team_id,team,division,position,experience,status,active,height,weight,record_key");
    expect(csv).toContain('2026,42,"A Player, Jr.",7,Example U,D2,QB,,,,,210,rosters:2026:42');
  });

  it("uses view-specific fields and does not invent unavailable values", () => {
    expect(footballRecruitingExportHeaders("recruits")).toEqual([
      "season", "recruit_id", "name", "team_id", "team", "division", "position", "stars", "grade", "record_key",
    ]);
    const csv = footballRecruitingCsv("talent", [{ team_id: "7", team: "Example U", talent_composite: 91.5 }], 2026);
    expect(csv).toContain("2026,7,Example U,,91.5,,,,");
    expect(csv.split("\r\n")[1]).toBe("2026,7,Example U,,91.5,,,,");
  });
});
