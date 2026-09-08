import NcaaRankings from "./NcaaRankings";

export const metadata = {
  title: "NCAA-derived player rankings",
  description: "Rank men’s college basketball players by NCAA-derived scoring, rebounding, playmaking and shooting efficiency.",
};

export default function Page() {
  return <NcaaRankings />;
}
