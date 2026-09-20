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
  { label: "Teams", href: "/basketball/ratings/", match: ["/basketball/ratings"] },
  { label: "Players", href: "/basketball/players/", match: ["/basketball/players", "/basketball/player"] },
  { label: "Recruiting", href: "/basketball/recruiting/", match: ["/basketball/recruiting"] },
  { label: "Games", href: "/basketball/matchups/", match: ["/basketball/matchups", "/basketball/briefs", "/basketball/gameplan"] },
  { label: "Predictions", href: "/basketball/forecast-lab/", match: ["/basketball/forecast-lab", "/research/scorecard"] },
  { label: "Rankings", href: "/basketball/rankings/", match: ["/basketball/rankings", "/basketball/ncaa-rankings"] },
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
      { label: "Games", href: "/football/matchups/", match: ["/football/matchups"] },
      { label: "Predictions", href: "/football/", match: ["/football", "/football/"], exact: true },
      { label: "Rankings", href: "/football/ratings/", match: ["/football/ratings"] },
    ],
    explore: [
      { label: "National leaders", href: "/football/ncaa-leaders/", match: ["/football/ncaa-leaders"] },
      { label: "Stat archive", href: "/football/source-stats/", match: ["/football/source-stats"] },
      { label: "Player careers", href: "/football/careers/", match: ["/football/careers"] },
      { label: "Events & defense", href: "/football/events/", match: ["/football/events"] },
      { label: "Methodology", href: "/football/methodology/", match: ["/football/methodology"] },
      { label: "Journal", href: "/blog/", match: ["/blog"] },
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

export function sportForPathname(pathname: string, gender: string | null = null): Sport {
  if (pathname === "/football" || pathname.startsWith("/football/")) return "football";
  return gender === "women" ? "womens-basketball" : "mens-basketball";
}

export function sportSupportsGenderScope(sport: Sport): boolean {
  return sport !== "football";
}

/** Keep the scope banner aligned with the rows actually published for each sport. */
export function sportAvailabilityMessage(sport: Sport, division: Division): string | null {
  if (sport !== "football") return null;
  if (division === "1") {
    return "Football coverage: D1 player and team tables plus model forecasts; D2 and D3 schedule rows are available, while lower-division player tables and forecasts are not yet published.";
  }
  return `Football coverage: D${division} schedule rows are available. Player tables, team stats and model forecasts for D${division} are not yet published.`;
}

export function isNavItemActive(pathname: string, item: SportNavItem): boolean {
  return item.match.some((prefix) => item.exact
    ? pathname === prefix
    : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function buildScopeHref(pathname: string, currentSearch: string, gender: Gender, division: Division): string {
  const params = new URLSearchParams(currentSearch);
  params.set("gender", gender);
  params.set("division", division);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
