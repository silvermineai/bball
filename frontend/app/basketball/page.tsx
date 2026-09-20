import StatsDashboard from "../_components/StatsDashboard";
import ScopeUnavailable from "../_components/ScopeUnavailable";
import { basketballScopeAvailable, parseSportScope } from "../_lib/sport-scope";

export const metadata = {
  title: "College basketball stats, ratings and predictions",
  description: "College basketball team stats, player production, upcoming games and Silvermine model predictions.",
};

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseSportScope(await searchParams);
  return basketballScopeAvailable(scope) ? <StatsDashboard /> : <ScopeUnavailable sport="basketball" scope={scope} />;
}
