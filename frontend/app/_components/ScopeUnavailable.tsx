"use client";

import Link from "next/link";
import type { SportScope } from "../_lib/sport-scope";
import { scopeLabel } from "../_lib/sport-scope";
import WomensBasketballSnapshot from "./WomensBasketballSnapshot";
import WomensBasketballRankings from "./WomensBasketballRankings";
import WomensBasketballTeams from "./WomensBasketballTeams";
import WomensBasketballPlayers from "./WomensBasketballPlayers";
import DivisionPlayerArchive from "./DivisionPlayerArchive";
import WomensDivisionReadiness from "./WomensDivisionReadiness";
import { usePathname } from "next/navigation";

type Props = {
  sport: "basketball" | "football";
  scope: SportScope;
};

export default function ScopeUnavailable({ sport, scope }: Props) {
  const pathname = usePathname() || "";
  const isWomen = scope.gender === "women";
  const womenRankings = isWomen && sport === "basketball" && scope.division === "1" && (pathname === "/basketball/rankings" || pathname.startsWith("/basketball/rankings/") || pathname === "/basketball/ncaa-rankings" || pathname.startsWith("/basketball/ncaa-rankings/"));
  const womenTeams = isWomen && sport === "basketball" && scope.division === "1" && ["/basketball/ratings", "/basketball/teams", "/basketball/team-stats", "/basketball/standings"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const womenPlayers = isWomen && sport === "basketball" && scope.division === "1" && ["/basketball/players", "/basketball/ncaa-player", "/basketball/player-profiles"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const divisionPlayers = !isWomen && sport === "basketball" && (scope.division === "2" || scope.division === "3") && ["/basketball/players", "/basketball/ncaa", "/basketball/ncaa-rankings"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const womenDivisionReadiness = isWomen && sport === "basketball" && (scope.division === "2" || scope.division === "3") ? scope.division : null;
  const sportName = sport === "basketball" ? "Women's basketball" : "football";
  const publishedWomenDivisionOne = isWomen && sport === "basketball" && scope.division === "1";
  const detail = isWomen
    ? scope.division === "1"
      ? "The women’s source-native edition includes observed player production, roster context, upcoming games and a separately validated women’s forecast model."
      : "Women’s Division II and Division III rows are not imported yet. No Division I rows are substituted."
    : sport === "football"
      ? "The current football archive is FBS/FCS. Division II and Division III rows are not substituted with another division."
      : "The current basketball dashboard is published for men’s Division I. Other divisions remain available in the supported archive pages when their rows are present.";

  return (
    <section className="scope-unavailable" aria-labelledby="scope-unavailable-title">
      <div className="eyebrow">{publishedWomenDivisionOne ? "WOMEN'S D1 PUBLISHED" : divisionPlayers ? `D${scope.division} PLAYER ARCHIVE` : "SCOPE NOT PUBLISHED"}</div>
      <h1 id="scope-unavailable-title">{sportName} · {scopeLabel(scope)}</h1>
      <p>{detail}</p>
      {womenRankings ? <WomensBasketballRankings /> : womenTeams ? <WomensBasketballTeams /> : womenPlayers ? <WomensBasketballPlayers /> : divisionPlayers ? <DivisionPlayerArchive division={scope.division} /> : womenDivisionReadiness ? <WomensDivisionReadiness division={womenDivisionReadiness} /> : isWomen && sport === "basketball" && scope.division === "1" ? <WomensBasketballSnapshot /> : null}
      <div className="scope-unavailable-actions">
        <Link className="button" href={publishedWomenDivisionOne ? "/basketball/?gender=women&division=1" : sport === "basketball" ? "/basketball/ncaa/?division=1" : "/football/source-stats/"}>
          {publishedWomenDivisionOne ? "Open women’s dashboard" : "Open published archive"}
        </Link>
        <Link className="hero-link" href="/research/coverage/">View coverage details →</Link>
      </div>
    </section>
  );
}
