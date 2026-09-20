import FootballDashboard from "../_components/FootballDashboard";
import ScopedDashboard from "../_components/ScopedDashboard";

export const metadata = {
  title: "College football stats, ratings and predictions",
  description: "College football team ratings, player production, upcoming games and Silvermine model predictions.",
  alternates: { canonical: "/football/" },
};

export default function Page() {
  return <ScopedDashboard sport="football"><FootballDashboard /></ScopedDashboard>;
}
