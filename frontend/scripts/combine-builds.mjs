import { cp, mkdir, rm, writeFile } from "node:fs/promises";
await rm("dist/client", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await cp("out", "dist/client", { recursive: true });
// Keep the generated sitemap reachable when a previous negative cache entry
// exists for Next's conventional /sitemap.xml key.
await cp("out/sitemap.xml", "dist/client/sitemap-index.xml");
// Keep the compact research ledger in Workers Assets as a static fallback for
// scorecard pages. The current published ledger is below the Workers Assets
// per-file limit, and retaining it also makes a build self-contained when the
// live D1 read is temporarily busy.
await mkdir("dist/client/basketball-shell", { recursive: true });
await cp(
  "dist/basketball/index.html",
  "dist/client/basketball-shell/index.html",
);
await cp("dist/basketball/assets", "dist/client/basketball/assets", {
  recursive: true,
});
// Football game blogs are captured into the immutable R2 reading archive by
// the deploy wrapper. Basketball briefs remain in Workers Assets so the
// current page can ship with the latest coaching links and evidence; missing
// or retired briefs still fall back to their archived R2 revision in the
// Worker. The research ledger is served by the live scorecard API; excluding
// its oversized static fallback keeps the Workers Assets manifest under the
// 25 MiB per-file limit.
await writeFile(
  "dist/client/.assetsignore",
  // Wrangler walks files with paths such as `blog/game-123/index.html`.
  // Match the directory prefix without a trailing slash so archive snapshots
  // stay available to the post-deploy R2 capture without counting toward the
  // Workers static-asset manifest.
  "blog/game-*\n",
);
