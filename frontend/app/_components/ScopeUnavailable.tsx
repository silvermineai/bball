"use client";

import Link from "next/link";
import type { SportScope } from "../_lib/sport-scope";
import { scopeLabel } from "../_lib/sport-scope";

type Props = {
  sport: "basketball" | "football";
  scope: SportScope;
};

export default function ScopeUnavailable({ sport, scope }: Props) {
  const isWomen = scope.gender === "women";
  const sportName = sport === "basketball" ? "Women's basketball" : "football";
  const detail = isWomen
    ? "The women’s archive is not imported yet. This page will stay empty until a reviewed women’s edition is available."
    : sport === "football"
      ? "The current football archive is FBS/FCS. Division II and Division III rows are not substituted with another division."
      : "The current basketball dashboard is published for men’s Division I. Other divisions remain available in the supported archive pages when their rows are present.";

  return (
    <section className="scope-unavailable" aria-labelledby="scope-unavailable-title">
      <div className="eyebrow">SCOPE NOT PUBLISHED</div>
      <h1 id="scope-unavailable-title">{sportName} · {scopeLabel(scope)}</h1>
      <p>{detail}</p>
      <div className="scope-unavailable-actions">
        <Link className="button" href={sport === "basketball" ? "/basketball/ncaa/?division=1" : "/football/source-stats/"}>
          Open published archive
        </Link>
        <Link className="hero-link" href="/research/coverage/">View coverage details →</Link>
      </div>
    </section>
  );
}
