import fs from "node:fs";
import path from "node:path";
import NcaaCurrentLeaders, { type IndividualPlayer } from "./NcaaCurrentLeaders";
import NcaaRankings from "./NcaaRankings";

export const metadata = {
  title: "Player rankings",
  description: "Rank current NCAA college basketball players by division, scoring, rebounding, playmaking and shooting efficiency.",
};

function getPlayers() {
  const file = path.join(process.cwd(), "public/data/basketball/ncaa-individual.json");
  if (!fs.existsSync(file)) return [] as IndividualPlayer[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players?: IndividualPlayer[] };
  return Array.isArray(data.players) ? data.players : [];
}

export default function Page() {
  return <>
    <NcaaCurrentLeaders players={getPlayers()} />
    <NcaaRankings />
  </>;
}
