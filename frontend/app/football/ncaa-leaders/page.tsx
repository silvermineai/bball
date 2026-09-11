import fs from "node:fs";
import path from "node:path";
import NCAALeaders, { type Release } from "./NCAALeaders";

export const metadata = {
  title: "NCAA football player leaders",
  description:
    "Source-native NCAA football player and unit leaderboards built from game-level player statistics.",
  alternates: { canonical: "/football/ncaa-leaders/" },
};

export default function Page() {
  const release = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/ncaa-player-leaders.json"),
      "utf8",
    ),
  ) as Release;
  return <NCAALeaders release={release} />;
}
