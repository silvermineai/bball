import { getBasketball } from "./_lib/basketball-data";
import { getScoutIndex } from "./_lib/scouting-data";
import type { MetadataRoute } from "next";
import { getOverview } from "./_lib/data";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const d = getOverview(),
    base = "https://bball.silvermine.dev";
  return [
    "",
    "/football/",
    "/research/scorecard/",
    "/basketball/",
    "/basketball/ratings/",
    "/basketball/programs/",
    "/basketball/compare/",
    "/basketball/shooting/",
    ...getScoutIndex().teams.map((t) => `/basketball/programs/${t.id}/`),
    "/basketball/players/",
    "/basketball/recruiting/",
    "/basketball/impact/",
    "/basketball/model/",
    "/basketball/evaluation/",
    "/basketball/matchups/",
    ...getBasketball()
      .upcoming.filter((g) => g.prediction)
      .map((g) => `/basketball/briefs/${g.id}/`),
    "/football/matchups/",
    "/football/players/",
    "/football/events/",
    "/football/efficiency/",
    "/football/ratings/",
    "/football/methodology/",
    "/football/evaluation/",
    "/blog/",
    "/blog/reading-the-forecast/",
    "/blog/understanding-player-epa/",
    "/blog/market-comparison/",
    ...d.upcoming.filter((g) => g.prediction).map((g) => `/blog/game-${g.id}/`),
  ].map((path) => ({
    url: base + path,
    lastModified: path.endsWith("/evaluation/") ? undefined : d.generated_at,
    changeFrequency: path.startsWith("/blog/") ? "weekly" : "daily",
  }));
}
