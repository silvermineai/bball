import MatchupStints from "./MatchupStints";

export const metadata = {
  title: "College basketball five-v-five matchup archive",
  description: "Explore NCAA-derived five-player versus five-player matchup stints, possessions and scoring margins across eight seasons.",
  alternates: { canonical: "/basketball/matchup-stints/" },
};

export default function Page() {
  return <MatchupStints />;
}
