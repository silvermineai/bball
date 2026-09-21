import { describe, expect, it } from "vitest";
import { recruitingFitHref } from "./player-recruiting-handoff";

describe("player recruiting handoff", () => {
  it("links a retained numeric team ID to the role-fit board", () => {
    expect(recruitingFitHref("2127")).toBe("/basketball/recruiting/fit/?team=2127");
  });

  it("withholds the handoff when the team identity is unavailable or malformed", () => {
    expect(recruitingFitHref(null)).toBeNull();
    expect(recruitingFitHref("team-name")).toBeNull();
    expect(recruitingFitHref(" 2127 ")).toBe("/basketball/recruiting/fit/?team=2127");
  });
});
