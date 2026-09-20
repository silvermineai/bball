import { describe, expect, it } from "vitest";
import { buildScopeHref, isNavItemActive, SPORT_NAVIGATION, sportAvailabilityMessage, sportForPathname, sportSupportsGenderScope } from "./sport-navigation";

describe("sport navigation", () => {
  it("keeps the active sport aligned with the URL and gender scope", () => {
    expect(sportForPathname("/football/players/", "men")).toBe("football");
    expect(sportForPathname("/basketball/matchups/", "men")).toBe("mens-basketball");
    expect(sportForPathname("/basketball/matchups/", "women")).toBe("womens-basketball");
    expect(sportForPathname("/research/coverage/", "men", "football")).toBe("football");
    expect(Object.keys(SPORT_NAVIGATION)).toEqual(["mens-basketball", "womens-basketball", "football"]);
  });

  it("matches nested section routes without fuzzy names", () => {
    const games = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Games");
    const teams = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Teams");
    const players = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Players");
    const rankings = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Rankings");
    const footballPredictions = SPORT_NAVIGATION.football.items.find((item) => item.label === "Predictions");
    expect(games).toBeDefined();
    expect(teams).toBeDefined();
    expect(players).toBeDefined();
    expect(rankings).toBeDefined();
    expect(isNavItemActive("/basketball/briefs/abc", games!)).toBe(true);
    expect(isNavItemActive("/basketball/games", games!)).toBe(true);
    expect(isNavItemActive("/basketball/programs/abc", games!)).toBe(false);
    expect(isNavItemActive("/basketball/team-stats/", teams!)).toBe(true);
    expect(isNavItemActive("/basketball/ncaa/", players!)).toBe(true);
    expect(isNavItemActive("/basketball/ncaa-rankings/", players!)).toBe(false);
    expect(isNavItemActive("/basketball/ncaa-rankings/", rankings!)).toBe(true);
    expect(isNavItemActive("/football/ratings/", footballPredictions!)).toBe(false);
    expect(isNavItemActive("/football/", footballPredictions!)).toBe(true);
  });

  it("encodes gender and division while preserving existing filters", () => {
    expect(buildScopeHref("/basketball/players/", "?season=2027", "women", "3"))
      .toBe("/basketball/players/?season=2027&gender=women&division=3");
    expect(buildScopeHref("/research/coverage/?sport=football", "?season=2027", "men", "2"))
      .toBe("/research/coverage/?season=2027&sport=football&gender=men&division=2");
  });

  it("advertises the published women's D1 sport tab", () => {
    expect(SPORT_NAVIGATION["womens-basketball"].available).toBe(true);
  });

  it("keeps the core stat tabs consistent across each sport tab", () => {
    const labels = Object.values(SPORT_NAVIGATION).map((config) => config.items.map((item) => item.label));
    expect(labels).toEqual([
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Rankings", "Division"],
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Rankings", "Division"],
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Rankings", "Division"],
    ]);

    expect(SPORT_NAVIGATION["womens-basketball"].items.find((item) => item.label === "Division")?.href)
      .toBe("/research/coverage/?sport=basketball");
    expect(SPORT_NAVIGATION.football.items.find((item) => item.label === "Division")?.href)
      .toBe("/research/coverage/?sport=football");
  });

  it("surfaces validated player shooting and recruiting-fit labs in Explore", () => {
    const explore = SPORT_NAVIGATION["mens-basketball"].explore;
    const shooting = explore.find((item) => item.label === "Player shooting profiles");
    const recruitingFit = explore.find((item) => item.label === "Recruiting fit");
    expect(shooting?.href).toBe("/basketball/ncaa-shooting/");
    expect(recruitingFit?.href).toBe("/basketball/recruiting/fit/");
    expect(isNavItemActive("/basketball/ncaa-shooting/", shooting!)).toBe(true);
    expect(isNavItemActive("/basketball/recruiting/fit/", recruitingFit!)).toBe(true);
  });

  it("does not offer a nonexistent women's football scope", () => {
    expect(sportSupportsGenderScope("football")).toBe(false);
    expect(sportSupportsGenderScope("mens-basketball")).toBe(true);
    expect(sportSupportsGenderScope("womens-basketball")).toBe(true);
  });

  it("describes football lower-division coverage without overstating the archive", () => {
    expect(sportAvailabilityMessage("football", "1")).toContain("D2 and D3 schedules and score-derived record boards are available");
    expect(sportAvailabilityMessage("football", "2")).toBe(
      "Football coverage: D2 schedule rows and score-derived team records are available. Player tables, opponent-adjusted ratings and model forecasts for D2 are not yet published.",
    );
    expect(sportAvailabilityMessage("mens-basketball", "3")).toBeNull();
  });
});
