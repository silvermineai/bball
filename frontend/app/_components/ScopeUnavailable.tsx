"use client";

import Link from "next/link";
import type { SportScope } from "../_lib/sport-scope";
import { scopeLabel } from "../_lib/sport-scope";
import WomensBasketballSnapshot from "./WomensBasketballSnapshot";
import WomensBasketballRankings from "./WomensBasketballRankings";
import WomensBasketballTeams from "./WomensBasketballTeams";
import WomensBasketballPlayers from "./WomensBasketballPlayers";
import DivisionPlayerArchive from "./DivisionPlayerArchive";
import DivisionTeamArchive from "./DivisionTeamArchive";
import WomensDivisionReadiness from "./WomensDivisionReadiness";
import FootballDivisionAvailability from "./FootballDivisionAvailability";
import DivisionArchiveSummary from "./DivisionArchiveSummary";
import WomensBasketballGames from "./WomensBasketballGames";
import { lowerFootballDivision } from "../_lib/football-division-scope";
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
  const womenGames = isWomen && sport === "basketball" && scope.division === "1" && ["/basketball/games", "/basketball/matchups", "/basketball/forecast-lab"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const divisionPlayers = !isWomen && sport === "basketball" && (scope.division === "2" || scope.division === "3") && ["/basketball/players", "/basketball/ncaa", "/basketball/ncaa-rankings"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const divisionTeams = !isWomen && sport === "basketball" && (scope.division === "2" || scope.division === "3") && ["/basketball/ratings", "/basketball/teams", "/basketball/team-stats", "/basketball/standings"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const lowerDivision = scope.division === "2" || scope.division === "3" ? scope.division : null;
  const lowerFootball = lowerFootballDivision(sport, scope);
  const womenDivisionReadiness = isWomen && sport === "basketball" && (scope.division === "2" || scope.division === "3") ? scope.division : null;
  const lowerBasketballSummary = !isWomen && sport === "basketball" && (scope.division === "2" || scope.division === "3") && !divisionPlayers && !divisionTeams ? scope.division : null;
  const sportName = sport === "basketball" ? `${isWomen ? "Women's" : "Men's"} basketball` : "football";
  const publishedWomenDivisionOne = isWomen && sport === "basketball" && scope.division === "1";
  const detail = isWomen
    ? scope.division === "1"
      ? "The women’s source-native edition includes observed player production, roster context, upcoming games and a separately validated women’s forecast model."
      : "Women’s Division II and Division III rows are not imported yet. No Division I rows are substituted."
    : sport === "football"
      ? "The current football archive is FBS/FCS. Division II and Division III rows are not substituted with another division."
      : "The current dashboard is published for men’s Division I. Retained Division II and III player and team-directory rows are available in their archive views; forecasts and unsupported fields remain unavailable.";

  return (
    <section className="scope-unavailable" aria-labelledby="scope-unavailable-title">
      <div className="eyebrow">{publishedWomenDivisionOne ? "WOMEN'S D1 PUBLISHED" : divisionPlayers ? `D${scope.division} PLAYER ARCHIVE` : "SCOPE NOT PUBLISHED"}</div>
      <h1 id="scope-unavailable-title">{sportName} · {scopeLabel(scope)}</h1>
      <p>{detail}</p>
      {womenRankings ? <WomensBasketballRankings /> : womenTeams ? <WomensBasketballTeams /> : womenPlayers ? <WomensBasketballPlayers /> : womenGames ? <WomensBasketballGames /> : divisionPlayers && lowerDivision ? <DivisionPlayerArchive division={lowerDivision} /> : divisionTeams && lowerDivision ? <DivisionTeamArchive division={lowerDivision} /> : lowerBasketballSummary ? <DivisionArchiveSummary division={lowerBasketballSummary} /> : womenDivisionReadiness ? <WomensDivisionReadiness division={womenDivisionReadiness} /> : lowerFootball ? <FootballDivisionAvailability division={lowerFootball} /> : isWomen && sport === "basketball" && scope.division === "1" ? <WomensBasketballSnapshot /> : null}
      <div className="scope-unavailable-actions">
        {publishedWomenDivisionOne ? <Link className="button" href="/basketball/?gender=women&division=1">Open women’s dashboard</Link> : lowerBasketballSummary ? <><Link className="button" href={`/basketball/ncaa/?division=${lowerBasketballSummary}`}>Open D{lowerBasketballSummary} player archive</Link><Link className="hero-link" href={`/basketball/ratings/?division=${lowerBasketballSummary}`}>Open D{lowerBasketballSummary} team archive →</Link></> : !isWomen ? <Link className="button" href={sport === "basketball" ? "/basketball/ncaa/?division=1" : "/football/source-stats/"}>Open published archive</Link> : null}
        <Link className="hero-link" href="/research/coverage/">View coverage details →</Link>
      </div>
    </section>
  );
}
