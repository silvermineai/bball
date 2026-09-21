"use client";

import { useSearchParams } from "next/navigation";
import WomensDivisionReadiness from "./WomensDivisionReadiness";
import WomensForecastReadiness from "./WomensForecastReadiness";

/** Keep the shared Women's Division tab aligned with the requested division. */
export default function WomensReadinessRouter() {
  const searchParams = useSearchParams();
  const division = searchParams.get("division");
  if (division === "2" || division === "3") {
    return <WomensDivisionReadiness division={division} />;
  }
  return <WomensForecastReadiness />;
}
