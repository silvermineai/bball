import { describe, expect, it } from "vitest";
import { buildScopeHref, isNavItemActive, SPORT_NAVIGATION, sportAvailabilityMessage, sportForPathname, sportSupportsGenderScope } from "./sport-navigation";

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

  it("keeps the core stat tabs consistent across each sport tab", () => {
    const labels = Object.values(SPORT_NAVIGATION).map((config) => config.items.map((item) => item.label));
    expect(labels).toEqual([
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Rankings"],
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Rankings"],
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Rankings"],
    ]);
  });

  it("does not offer a nonexistent women's football scope", () => {
    expect(sportSupportsGenderScope("football")).toBe(false);
    expect(sportSupportsGenderScope("mens-basketball")).toBe(true);
    expect(sportSupportsGenderScope("womens-basketball")).toBe(true);
  });

  it("describes football lower-division coverage without overstating the archive", () => {
    expect(sportAvailabilityMessage("football", "1")).toContain("D2 and D3 schedule rows are available");
    expect(sportAvailabilityMessage("football", "2")).toBe(
      "Football coverage: D2 schedule rows are available. Player tables, team stats and model forecasts for D2 are not yet published.",
    );
    expect(sportAvailabilityMessage("mens-basketball", "3")).toBeNull();
  });
});
