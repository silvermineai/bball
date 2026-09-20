"use client";

import { useEffect, useState } from "react";
import ScopeUnavailable from "./ScopeUnavailable";
import { basketballScopeAvailable, footballScopeAvailable, parseSportScope, type SportScope } from "../_lib/sport-scope";

type Props = {
  sport: "basketball" | "football";
  children: React.ReactNode;
};

const DEFAULT_SCOPE: SportScope = { gender: "men", division: "1" };

export default function ScopedDashboard({ sport, children }: Props) {
  const [scope, setScope] = useState<SportScope>(DEFAULT_SCOPE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScope(parseSportScope({
      gender: params.get("gender") || undefined,
      division: params.get("division") || undefined,
    }));
    setHydrated(true);
  }, []);

  const available = sport === "basketball"
    ? basketballScopeAvailable(scope)
    : footballScopeAvailable(scope);

  return hydrated && !available ? <ScopeUnavailable sport={sport} scope={scope} /> : children;
}
