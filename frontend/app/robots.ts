import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/research/game/",
        "/football/player/",
        "/basketball/player/",
        "/basketball-shell/",
        "/basketball/admin",
        "/basketball/login",
      ],
    },
    sitemap: "https://bball.silvermine.dev/sitemap.xml",
  };
}
