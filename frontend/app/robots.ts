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
    // Cloudflare can retain a negative cache entry for Next's conventional
    // sitemap.xml asset. Publish the same generated document under a stable
    // alternate key in the combined Workers asset directory.
    sitemap: "https://bball.silvermine.dev/sitemap-index.xml",
  };
}
