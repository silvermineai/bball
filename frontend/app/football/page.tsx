import FootballDashboard from "../_components/FootballDashboard";

export const metadata = {
  title: "College football stats, ratings and predictions",
  description: "College football team ratings, player production, upcoming games and Silvermine model predictions.",
  alternates: { canonical: "/football/" },
};

export default function Page() {
  return <FootballDashboard />;
}
