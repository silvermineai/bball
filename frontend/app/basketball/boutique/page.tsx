import { Suspense } from "react";
import Boutique from "./Boutique";
import { getBasketball } from "../../_lib/basketball-data";

export const metadata = {
  title: "Basketball boutique ratings and player value",
  description: "Browse attributed publisher adjusted team ratings and Box Plus/Minus player value across recent college basketball seasons.",
  alternates: { canonical: "/basketball/boutique/" },
};

export default function Page() {
  const overview = getBasketball();
  // The overview is the upcoming 2026–27 edition; its retained team ratings
  // are the completed 2025–26 baseline used by the independent desk.
  return <Suspense fallback={<p>Loading boutique model archive…</p>}><Boutique ratings={overview.ratings} independentSeason={overview.season - 1} /></Suspense>;
}
