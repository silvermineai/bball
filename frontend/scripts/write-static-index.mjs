import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist", "client");
const assetsDir = join(distDir, "assets");
const assets = await readdir(assetsDir);

const indexJsCandidates = await Promise.all(
  assets
    .filter((asset) => /^index-.*\.js$/.test(asset))
    .map(async (asset) => ({
      asset,
      size: (await stat(join(assetsDir, asset))).size,
    })),
);

const entryJs = indexJsCandidates.sort((a, b) => b.size - a.size)[0]?.asset;
const entryCss = assets.find((asset) => /^index-.*\.css$/.test(asset));

if (!entryJs) {
  throw new Error("Could not find built index JavaScript asset.");
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Coach-first men's college basketball analytics with game, team, player, and shot data."
    />
    <title>Silvermine MBB Analytics</title>
    ${entryCss ? `<link rel="stylesheet" href="/assets/${entryCss}" />` : ""}
    <script type="module" src="/assets/${entryJs}"></script>
  </head>
  <body></body>
</html>
`;

await writeFile(join(distDir, "index.html"), html);
console.log(`Wrote dist/client/index.html using ${entryJs}${entryCss ? ` and ${entryCss}` : ""}.`);
