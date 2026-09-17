import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Style from "./Style";
import type { PossessionStyleCatalog } from "../../_lib/possession-style";

export const metadata = {
  title: "Possession style archive",
  description: "Team possession context: tempo, transition, assisted and garbage-time shares.",
  alternates: { canonical: "/basketball/possession-style/" },
};

export default function Page() {
  const file = path.join(process.cwd(), "public/data/basketball/ncaa-possession-style.json");
  let catalog: PossessionStyleCatalog = { version: 1, generated_at: new Date(0).toISOString(), seasons: [] };
  try {
    catalog = JSON.parse(fs.readFileSync(file, "utf8")) as PossessionStyleCatalog;
  } catch {
    // Keep the route buildable while the next verified source release is prepared.
  }
  const { attribution: _attribution, ...catalogWithoutAttribution } = catalog as PossessionStyleCatalog & {
    attribution?: unknown;
  };
  catalog = {
    ...catalogWithoutAttribution,
    seasons: catalog.seasons.map((season) => ({
      ...season,
      source: {
        fetched_at: season.source?.fetched_at,
        url: "",
        sha256: season.source?.sha256,
      },
    })),
  };
  return <>
    <Link className="eyebrow" href="/basketball/">← Basketball desk</Link>
    <Style catalog={catalog} />
  </>;
}
