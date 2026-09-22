import { describe, expect, it } from "vitest";
import {
  footballRecruitingDivisionParam,
  parseFootballRecruitingDivision,
} from "./football-recruiting-scope";

describe("football recruiting division scope", () => {
  it("opens shared D2 and D3 sport links in the matching personnel cohort", () => {
    expect(parseFootballRecruitingDivision("2")).toBe("d2");
    expect(parseFootballRecruitingDivision("3")).toBe("d3");
  });

  it("keeps D1 as the combined D1 desk with local FBS and FCS controls", () => {
    expect(parseFootballRecruitingDivision("1")).toBe("all");
    expect(parseFootballRecruitingDivision(null)).toBe("all");
    expect(parseFootballRecruitingDivision("fbs")).toBe("fbs");
    expect(parseFootballRecruitingDivision("fcs")).toBe("fcs");
  });

  it("writes lower divisions using the site-wide scope vocabulary", () => {
    expect(footballRecruitingDivisionParam("d2")).toBe("2");
    expect(footballRecruitingDivisionParam("d3")).toBe("3");
    expect(footballRecruitingDivisionParam("all")).toBeNull();
    expect(footballRecruitingDivisionParam("naia")).toBe("naia");
  });

  it("fails an unrecognized URL value closed to the unfiltered desk", () => {
    expect(parseFootballRecruitingDivision("division-two")).toBe("all");
  });
});
