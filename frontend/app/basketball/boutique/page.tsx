import { Suspense } from "react";
import Boutique from "./Boutique";

export const metadata = {
  title: "Basketball boutique ratings and player value",
  description: "Browse attributed publisher adjusted team ratings and Box Plus/Minus player value across recent college basketball seasons.",
  alternates: { canonical: "/basketball/boutique/" },
};

export default function Page() {
  return <Suspense fallback={<p>Loading boutique model archive…</p>}><Boutique /></Suspense>;
}
