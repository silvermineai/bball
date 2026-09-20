import FootballDashboard from "../_components/FootballDashboard";
import ScopeUnavailable from "../_components/ScopeUnavailable";
import { footballScopeAvailable, parseSportScope } from "../_lib/sport-scope";

export const metadata = {
  title: "College football stats, ratings and predictions",
  description: "College football team ratings, player production, upcoming games and Silvermine model predictions.",
  alternates: { canonical: "/football/" },
};

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseSportScope(await searchParams);
  return footballScopeAvailable(scope) ? <FootballDashboard /> : <ScopeUnavailable sport="football" scope={scope} />;
}
