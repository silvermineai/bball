import { Suspense } from "react";
import SourceStats from "./SourceStats";

export const metadata = {
  title: "Football source statistics browser",
  description: "Search every retained football player, event, team and market source record with raw fields and game context.",
  alternates: { canonical: "/football/source-stats/" },
};

export default function Page() {
  return <Suspense fallback={<p>Loading source statistics…</p>}><SourceStats /></Suspense>;
}
