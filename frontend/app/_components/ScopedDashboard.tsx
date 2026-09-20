"use client";

import { useSearchParams } from "next/navigation";
import ScopeUnavailable from "./ScopeUnavailable";
import { basketballScopeAvailable, footballScopeAvailable, parseSportScopeSearch } from "../_lib/sport-scope";

type Props = {
  sport: "basketball" | "football";
  children: React.ReactNode;
};

export default function ScopedDashboard({ sport, children }: Props) {
  // This is intentionally reactive: gender/division links update the query
  // string in place, so a mount-only window.location read would leave the
  // dashboard on its previous scope.
  const searchParams = useSearchParams();
  const scope = parseSportScopeSearch(searchParams.toString());

  const available = sport === "basketball"
    ? basketballScopeAvailable(scope)
    : footballScopeAvailable(scope);

  return !available ? <ScopeUnavailable sport={sport} scope={scope} /> : children;
}
