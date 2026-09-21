import StatsDashboard from "./_components/StatsDashboard";
import ScopedDashboard from "./_components/ScopedDashboard";

export const metadata = {
  title: "College sports stats, ratings and predictions",
  description: "College basketball and football team stats, player production, upcoming games and Silvermine model predictions.",
};

export default function Page() {
  return <ScopedDashboard sport="basketball"><StatsDashboard /></ScopedDashboard>;
}
