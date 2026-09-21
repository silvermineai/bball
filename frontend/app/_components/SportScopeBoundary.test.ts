import { describe, expect, it } from "vitest";
import { isPublishedBoundary, scopeBoundaryView } from "./SportScopeBoundary";

describe("sport scope boundary", () => {
  it("does not render the default men's page before the URL scope hydrates", () => {
    expect(scopeBoundaryView(false, "basketball", { gender: "women", division: "1" }, "/basketball/rankings")).toBe("loading");
  });

  it("renders the unqualified men's default for static reading routes", () => {
    expect(scopeBoundaryView(false, "basketball", { gender: "men", division: "1" }, "/basketball/briefs/401", false)).toBe("published");
  });

  it.each([
    "/basketball/rankings",
    "/basketball/players",
    "/basketball/teams",
    "/basketball/games",
    "/basketball/matchups",
  ])("routes women's basketball %s through the scope boundary", (pathname) => {
    expect(scopeBoundaryView(true, "basketball", { gender: "women", division: "1" }, pathname)).toBe("unavailable");
  });

  it("keeps women’s basketball isolated on every route", () => {
    expect(isPublishedBoundary("basketball", { gender: "women", division: "1" }, "/basketball/players")).toBe(true);
    expect(isPublishedBoundary("basketball", { gender: "women", division: "1" }, "/basketball/recruiting/")).toBe(true);
  });

  it("lets the women's Division tab render its scope readiness desk", () => {
    expect(isPublishedBoundary("basketball", { gender: "women", division: "1" }, "/basketball/wbb-readiness/")).toBe(false);
    expect(isPublishedBoundary("basketball", { gender: "women", division: "2" }, "/basketball/wbb-readiness/")).toBe(false);
    expect(scopeBoundaryView(true, "basketball", { gender: "women", division: "3" }, "/basketball/wbb-readiness/")).toBe("published");
  });

  it("allows published men’s NCAA D2/D3 archives", () => {
    expect(isPublishedBoundary("basketball", { gender: "men", division: "2" }, "/basketball/ncaa-rankings/")).toBe(false);
    expect(isPublishedBoundary("basketball", { gender: "men", division: "3" }, "/basketball/players/")).toBe(true);
  });

  it("fails closed for football D2/D3", () => {
    expect(isPublishedBoundary("football", { gender: "men", division: "2" }, "/football/players/")).toBe(true);
    expect(isPublishedBoundary("football", { gender: "men", division: "1" }, "/football/players/")).toBe(false);
  });

  it("keeps retained lower-division football schedules visible", () => {
    expect(isPublishedBoundary("football", { gender: "men", division: "2" }, "/football/matchups/")).toBe(false);
    expect(isPublishedBoundary("football", { gender: "men", division: "3" }, "/football/matchups/")).toBe(false);
  });
});
