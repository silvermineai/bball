import NcaaRankings from "./NcaaRankings";

export const metadata = {
  title: "Player rankings",
  description: "Rank men’s college basketball players by scoring, rebounding, playmaking and shooting efficiency.",
};

export default function Page() {
  return <NcaaRankings />;
}
