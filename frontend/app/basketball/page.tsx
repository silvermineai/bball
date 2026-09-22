import StatsDashboard from "../_components/StatsDashboard";
import ScopedDashboard from "../_components/ScopedDashboard";
import WomensBasketballSnapshot from "../_components/WomensBasketballSnapshot";

export const metadata = {
  title: "College basketball stats, ratings and predictions",
  description: "College basketball team stats, player production, upcoming games and Silvermine model predictions.",
};

export default function Page() {
  return <ScopedDashboard sport="basketball" womenChildren={<WomensBasketballSnapshot />}><StatsDashboard /></ScopedDashboard>;
}
