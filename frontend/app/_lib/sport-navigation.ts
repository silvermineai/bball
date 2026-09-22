export type Sport = "mens-basketball" | "womens-basketball" | "football";
export type Gender = "men" | "women";
export type Division = "1" | "2" | "3";

export type SportNavItem = {
  label: string;
  href: string;
  match: string[];
  exact?: boolean;
};

export type SportNavConfig = {
  label: string;
  gender: Gender;
  home: string;
  available: boolean;
  items: SportNavItem[];
  explore: SportNavItem[];
};

const BASKETBALL_ITEMS: SportNavItem[] = [
  { label: "Teams", href: "/basketball/ratings/", match: ["/basketball/ratings", "/basketball/teams", "/basketball/team-stats", "/basketball/standings"] },
  { label: "Players", href: "/basketball/players/", match: ["/basketball/players", "/basketball/player", "/basketball/ncaa", "/basketball/ncaa-rosters"] },
  { label: "Recruiting", href: "/basketball/recruiting/", match: ["/basketball/recruiting"] },
  { label: "Matches", href: "/basketball/matchups/", match: ["/basketball/matchups", "/basketball/games", "/basketball/briefs", "/basketball/gameplan"] },
  { label: "Predictions", href: "/basketball/forecast-lab/", match: ["/basketball/forecast-lab", "/research/scorecard"] },
  { label: "Learn", href: "/basketball/learn/", match: ["/basketball/learn"] },
  { label: "Rankings", href: "/basketball/rankings/", match: ["/basketball/rankings", "/basketball/ncaa-rankings"] },
  { label: "Division", href: "/research/coverage/?sport=basketball", match: ["/research/coverage"] },
];

const BASKETBALL_EXPLORE: SportNavItem[] = [
  { label: "Coach desk", href: "/basketball/coach/", match: [] },
  { label: "Shot locations", href: "/basketball/shooting/", match: [] },
  { label: "Player shooting profiles", href: "/basketball/ncaa-shooting/", match: ["/basketball/ncaa-shooting"] },
  { label: "Recruiting fit", href: "/basketball/recruiting/fit/", match: ["/basketball/recruiting/fit"] },
  { label: "Lineups", href: "/basketball/lineups/", match: [] },
  { label: "Impact", href: "/basketball/impact/", match: [] },
  { label: "Journal", href: "/basketball/blog/", match: ["/basketball/blog", "/blog"] },
  { label: "Data coverage", href: "/research/coverage/", match: [] },
];

export const SPORT_NAVIGATION: Record<Sport, SportNavConfig> = {
  "mens-basketball": {
    label: "Men's Basketball",
    gender: "men",
    home: "/basketball/",
    available: true,
    items: BASKETBALL_ITEMS,
    explore: BASKETBALL_EXPLORE,
  },
  "womens-basketball": {
    label: "Women's Basketball",
    gender: "women",
    home: "/basketball/",
    // Division I women’s tables, rankings, shot profiles and forecasts are
    // published. Route-level scope boundaries still fail closed for D2/D3.
    available: true,
    items: BASKETBALL_ITEMS,
    explore: BASKETBALL_EXPLORE,
  },
  football: {
    label: "Football",
    gender: "men",
    home: "/football/",
    available: true,
    items: [
      { label: "Teams", href: "/football/efficiency/", match: ["/football/efficiency"] },
      { label: "Players", href: "/football/players/", match: ["/football/players", "/football/player"] },
      { label: "Recruiting", href: "/football/recruiting/", match: ["/football/recruiting"] },
      { label: "Matches", href: "/football/matchups/", match: ["/football/matchups"] },
      { label: "Predictions", href: "/football/", match: ["/football", "/football/"], exact: true },
      { label: "Learn", href: "/football/methodology/", match: ["/football/methodology"] },
      { label: "Rankings", href: "/football/ratings/", match: ["/football/ratings"] },
      { label: "Division", href: "/research/coverage/?sport=football", match: ["/research/coverage"] },
    ],
    explore: [
      { label: "National leaders", href: "/football/ncaa-leaders/", match: ["/football/ncaa-leaders"] },
      { label: "Stat archive", href: "/football/source-stats/", match: ["/football/source-stats"] },
      { label: "Player careers", href: "/football/careers/", match: ["/football/careers"] },
      { label: "Events & defense", href: "/football/events/", match: ["/football/events"] },
      { label: "Methodology", href: "/football/methodology/", match: ["/football/methodology"] },
      { label: "Journal", href: "/football/blog/", match: ["/football/blog"] },
    ],
  },
};

export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "men", label: "Men's" },
  { value: "women", label: "Women's" },
];

export const DIVISION_OPTIONS: Array<{ value: Division; label: string }> = [
  { value: "1", label: "D1" },
  { value: "2", label: "D2" },
  { value: "3", label: "D3" },
];

/** Route the shared Division tab to the most useful scope-specific desk. */
export function divisionDeskHref(sport: Sport): string {
  return sport === "womens-basketball"
    ? "/basketball/wbb-readiness/"
    : sport === "football"
      ? "/research/coverage/?sport=football"
      : "/research/coverage/?sport=basketball";
}

/** Keep lower-division football tabs on the exact-division archive desk. */
export function divisionAwareNavHref(sport: Sport, division: Division, item: SportNavItem): string {
  // Women’s D2/D3 already has source-native schedule, team, player and
  // ranking evidence, but the identity-linked dashboard is intentionally not
  // published for those cohorts. Keep every shared tab useful by taking the
  // reader to the exact section of the readiness desk instead of the generic
  // unavailable shell (which hides the available tables behind a status card).
  if (sport === "womens-basketball" && division !== "1") {
    const sectionByLabel: Record<string, string> = {
      Teams: "wbb-lower-ratings",
      Players: "wbb-lower-player-stats",
      Recruiting: "wbb-lower-recruiting",
      Matches: "wbb-lower-schedule",
      Predictions: "wbb-lower-ratings",
      Learn: "wbb-division-readiness-title",
      Rankings: "wbb-lower-ranking",
    };
    const section = sectionByLabel[item.label];
    if (section) return `/basketball/wbb-readiness/#${section}`;
  }
  if (sport === "football" && division !== "1" && ["Teams", "Predictions", "Rankings"].includes(item.label)) {
    return "/football/matchups/#lower-division-results-title";
  }
  // The men’s NCAA ranking explorer is the only ranking surface that keeps
  // D1, D2 and D3 in their own cohorts. The general rankings landing page is
  // useful as a D1 directory, but its team board would hide the exact
  // lower-division player ranking table behind the scope gate. Women’s
  // basketball intentionally keeps its own source-native D1 ranking board.
  if (sport === "mens-basketball" && item.label === "Rankings") {
    return "/basketball/ncaa-rankings/";
  }
  if (sport === "womens-basketball" && item.label === "Rankings") {
    return "/basketball/ncaa-rankings/";
  }
  return item.href;
}

export function sportForPathname(pathname: string, gender: string | null = null, sport: string | null = null): Sport {
  if (pathname === "/football" || pathname.startsWith("/football/")) return "football";
  if (pathname === "/research/coverage" || pathname.startsWith("/research/coverage/")) {
    return sport === "football" ? "football" : gender === "women" ? "womens-basketball" : "mens-basketball";
  }
  return gender === "women" ? "womens-basketball" : "mens-basketball";
}

export function sportSupportsGenderScope(sport: Sport): boolean {
  return sport !== "football";
}

/** Keep the scope banner aligned with the rows actually published for each sport. */
export function sportAvailabilityMessage(sport: Sport, division: Division): string | null {
  if (sport === "womens-basketball") {
    if (division === "1") {
      return "Women's basketball coverage: D1 player, team, game, ranking and forecast tables are published. D2 and D3 remain separate intake scopes.";
    }
    return `Women's basketball coverage: D${division} source-native leaderboards are published for names and team slugs. Stable-ID player archives, rankings, and forecasts remain unavailable; no D1 rows are substituted.`;
  }
  if (sport !== "football") return null;
  if (division === "1") {
    return "Football coverage: D1 player and team tables plus model forecasts; D2 and D3 schedules and score-derived record boards are available alongside observed player tables, while lower-division forecast rows remain separately gated.";
  }
  return `Football coverage: D${division} schedule rows, score-derived team records, exact-division ratings, validated forecasts, and an observed player production archive are published. The player archive covers retained game summaries; national player rankings remain separately gated, and no D1 rows are substituted.`;
}

export function isNavItemActive(pathname: string, item: SportNavItem): boolean {
  return item.match.some((prefix) => item.exact
    ? pathname === prefix
    : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function buildScopeHref(pathname: string, currentSearch: string, gender: Gender, division: Division): string {
  const [pathAndQuery, hash = ""] = pathname.split("#", 2);
  const [basePath, embeddedQuery = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(currentSearch);
  for (const [key, value] of new URLSearchParams(embeddedQuery)) {
    params.set(key, value);
  }
  params.set("gender", gender);
  params.set("division", division);
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}
