import fs from "node:fs";
import path from "node:path";
import NCAALeaders, { type Release } from "../NCAALeaders";

const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

export function generateStaticParams() {
  return SEASONS.map((season) => ({ season: String(season) }));
}

export async function generateMetadata({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  return {
    title: `${season} NCAA football player leaders`,
    description: `Source-native NCAA football player and unit leaderboards for the ${season} season.`,
    alternates: { canonical: `/football/ncaa-leaders/${season}/` },
  };
}

export default async function Page({ params }: { params: Promise<{ season: string }> }) {
  const { season: rawSeason } = await params;
  const season = Number(rawSeason);
  const filename = season === 2025
    ? "ncaa-player-leaders.json"
    : `ncaa-player-leaders-${season}.json`;
  const release = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football", filename),
      "utf8",
    ),
  ) as Release;
  return <NCAALeaders release={release} />;
}
