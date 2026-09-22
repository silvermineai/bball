import { describe, expect, it } from "vitest";
import { buildScopeHref, divisionAwareNavHref, divisionDeskHref, isNavItemActive, SPORT_NAVIGATION, sportAvailabilityMessage, sportForPathname, sportSupportsGenderScope } from "./sport-navigation";

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
    expect(buildScopeHref("/football/matchups/#lower-division-results-title", "", "men", "3"))
      .toBe("/football/matchups/?gender=men&division=3#lower-division-results-title");
  });

  it("advertises the published women's D1 sport tab", () => {
    expect(SPORT_NAVIGATION["womens-basketball"].available).toBe(true);
  });

  it("routes each Division tab to its scope-specific desk", () => {
    expect(divisionDeskHref("womens-basketball")).toBe("/basketball/wbb-readiness/");
    expect(divisionDeskHref("mens-basketball")).toBe("/research/coverage/?sport=basketball");
    expect(divisionDeskHref("football")).toBe("/research/coverage/?sport=football");
  });

  it("keeps football lower-division stat tabs on the exact-division archive", () => {
    const teams = SPORT_NAVIGATION.football.items.find((item) => item.label === "Teams")!;
    const predictions = SPORT_NAVIGATION.football.items.find((item) => item.label === "Predictions")!;
    const rankings = SPORT_NAVIGATION.football.items.find((item) => item.label === "Rankings")!;
    expect(divisionAwareNavHref("football", "2", teams)).toBe("/football/matchups/#lower-division-results-title");
    expect(divisionAwareNavHref("football", "3", predictions)).toBe("/football/matchups/#lower-division-results-title");
    expect(divisionAwareNavHref("football", "2", rankings)).toBe("/football/matchups/#lower-division-results-title");
    expect(divisionAwareNavHref("football", "1", teams)).toBe(teams.href);
    expect(divisionAwareNavHref("mens-basketball", "3", teams)).toBe(teams.href);
  });

  it("routes every women's lower-division tab to published evidence", () => {
    const config = SPORT_NAVIGATION["womens-basketball"];
    const expectedSections: Record<string, string> = {
      Teams: "wbb-lower-ratings",
      Players: "wbb-lower-player-stats",
      Recruiting: "wbb-lower-recruiting",
      Games: "wbb-lower-schedule",
      Predictions: "wbb-lower-ratings",
      Learn: "wbb-division-readiness-title",
      Rankings: "wbb-lower-ranking",
    };
    for (const [label, section] of Object.entries(expectedSections)) {
      const item = config.items.find((candidate) => candidate.label === label)!;
      expect(divisionAwareNavHref("womens-basketball", "2", item)).toBe(`/basketball/wbb-readiness/#${section}`);
      expect(divisionAwareNavHref("womens-basketball", "3", item)).toBe(`/basketball/wbb-readiness/#${section}`);
    }
  });

  it("opens the men’s within-division ranking explorer from every division", () => {
    const rankings = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Rankings")!;
    expect(divisionAwareNavHref("mens-basketball", "1", rankings)).toBe("/basketball/ncaa-rankings/");
    expect(divisionAwareNavHref("mens-basketball", "2", rankings)).toBe("/basketball/ncaa-rankings/");
    expect(divisionAwareNavHref("mens-basketball", "3", rankings)).toBe("/basketball/ncaa-rankings/");
    expect(divisionAwareNavHref("womens-basketball", "1", rankings)).toBe("/basketball/ncaa-rankings/");
  });

  it("keeps the core stat tabs consistent across each sport tab", () => {
    const labels = Object.values(SPORT_NAVIGATION).map((config) => config.items.map((item) => item.label));
    expect(labels).toEqual([
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Learn", "Rankings", "Division"],
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Learn", "Rankings", "Division"],
      ["Teams", "Players", "Recruiting", "Games", "Predictions", "Learn", "Rankings", "Division"],
    ]);

    expect(SPORT_NAVIGATION["womens-basketball"].items.find((item) => item.label === "Division")?.href)
      .toBe("/research/coverage/?sport=basketball");
    expect(SPORT_NAVIGATION.football.items.find((item) => item.label === "Division")?.href)
      .toBe("/research/coverage/?sport=football");
  });

  it("links each sport edition to its own learning resource", () => {
    const basketballLearn = SPORT_NAVIGATION["mens-basketball"].items.find((item) => item.label === "Learn");
    const footballLearn = SPORT_NAVIGATION.football.items.find((item) => item.label === "Learn");
    expect(basketballLearn?.href).toBe("/basketball/learn/");
    expect(footballLearn?.href).toBe("/football/methodology/");
    expect(isNavItemActive("/basketball/learn/metric-explorer", basketballLearn!)).toBe(true);
    expect(isNavItemActive("/football/methodology", footballLearn!)).toBe(true);
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

  it("keeps football notebooks inside the football desk", () => {
    const journal = SPORT_NAVIGATION.football.explore.find((item) => item.label === "Journal");
    expect(journal?.href).toBe("/football/blog/");
    expect(isNavItemActive("/football/blog/", journal!)).toBe(true);
  });

  it("does not offer a nonexistent women's football scope", () => {
    expect(sportSupportsGenderScope("football")).toBe(false);
    expect(sportSupportsGenderScope("mens-basketball")).toBe(true);
    expect(sportSupportsGenderScope("womens-basketball")).toBe(true);
  });

  it("describes football lower-division coverage without overstating the archive", () => {
    expect(sportAvailabilityMessage("football", "1")).toContain("D2 and D3 schedules and score-derived record boards are available");
    expect(sportAvailabilityMessage("football", "2")).toBe(
      "Football coverage: D2 schedule rows, score-derived team records, exact-division ratings, validated forecasts, and an observed player production archive are published. The player archive covers retained game summaries; national player rankings remain separately gated, and no D1 rows are substituted.",
    );
    expect(sportAvailabilityMessage("mens-basketball", "3")).toBeNull();
  });

  it("makes women's basketball division boundaries visible in the shared nav", () => {
    expect(sportAvailabilityMessage("womens-basketball", "1")).toContain("D1 player, team, game, ranking and forecast tables are published");
    expect(sportAvailabilityMessage("womens-basketball", "2")).toBe(
      "Women's basketball coverage: D2 source-native leaderboards are published for names and team slugs. Stable-ID player archives, rankings, and forecasts remain unavailable; no D1 rows are substituted.",
    );
  });
});
