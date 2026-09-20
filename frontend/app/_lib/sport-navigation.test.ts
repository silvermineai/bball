import { describe, expect, it } from "vitest";
import { buildScopeHref, isNavItemActive, SPORT_NAVIGATION, sportForPathname } from "./sport-navigation";

describe("sport navigation", () => {
  it("keeps the active sport aligned with the URL and gender scope", () => {
    expect(sportForPathname("/football/players/", "men")).toBe("football");
    expect(sportForPathname("/basketball/matchups/", "men")).toBe("mens-basketball");
    expect(sportForPathname("/basketball/matchups/", "women")).toBe("womens-basketball");
    expect(Object.keys(SPORT_NAVIGATION)).toEqual(["mens-basketball", "womens-basketball", "football"]);
  });

  it("matches nested section routes without fuzzy names", () => {
    const games = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Games");
    const footballPredictions = SPORT_NAVIGATION.football.items.find((item) => item.label === "Predictions");
    expect(games).toBeDefined();
    expect(isNavItemActive("/basketball/briefs/abc", games!)).toBe(true);
    expect(isNavItemActive("/basketball/programs/abc", games!)).toBe(false);
    expect(isNavItemActive("/football/ratings/", footballPredictions!)).toBe(false);
    expect(isNavItemActive("/football/", footballPredictions!)).toBe(true);
  });

  it("encodes gender and division while preserving existing filters", () => {
    expect(buildScopeHref("/basketball/players/", "?season=2027", "women", "3"))
      .toBe("/basketball/players/?season=2027&gender=women&division=3");
  });

  it("advertises the published women's D1 sport tab", () => {
    expect(SPORT_NAVIGATION["womens-basketball"].available).toBe(true);
  });
});
