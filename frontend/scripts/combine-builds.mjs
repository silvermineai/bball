import { cp, mkdir, rm, writeFile } from "node:fs/promises";
await rm("dist/client", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await cp("out", "dist/client", { recursive: true });
await mkdir("dist/client/basketball-shell", { recursive: true });
await cp(
  "dist/basketball/index.html",
  "dist/client/basketball-shell/index.html",
);
await cp("dist/basketball/assets", "dist/client/basketball/assets", {
  recursive: true,
});
// Matchup briefs are captured into the immutable R2 reading archive by the
// deploy wrapper. Keeping thousands of duplicate HTML snapshots in Workers
// Assets can crowd out the public data catalogs; the Worker redirects these
// two URL families to their archived R2 revision when an asset is absent.
await writeFile(
  "dist/client/.assetsignore",
  // Wrangler walks files with paths such as `blog/game-123/index.html`.
  // Match the directory prefixes without a trailing slash so the archive
  // snapshots stay available to the post-deploy R2 capture without counting
  // toward the Workers static-asset manifest.
  "/blog/game-*\n/basketball/briefs/[0-9]*\n",
);
