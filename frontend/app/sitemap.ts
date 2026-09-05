import type { MetadataRoute } from "next";
import { getOverview } from "./_lib/data";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const d = getOverview(),
    base = "https://bball.silvermine.dev";
  return [
    "",
    "/football/",
    "/football/matchups/",
    "/football/players/",
    "/football/ratings/",
    "/football/methodology/",
    "/blog/",
    "/blog/reading-the-forecast/",
    "/blog/understanding-player-epa/",
    "/blog/market-comparison/",
    ...d.upcoming.filter((g) => g.prediction).map((g) => `/blog/game-${g.id}/`),
  ].map((path) => ({
    url: base + path,
    lastModified: d.generated_at,
    changeFrequency: path.startsWith("/blog/") ? "weekly" : "daily",
  }));
}
