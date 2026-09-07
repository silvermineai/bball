import { Suspense } from "react";
import SourceStats from "./SourceStats";

export const metadata = {
  title: "Publisher player statistics browser",
  description: "Search every retained publisher-defined player-season field in the Silvermine college basketball archive.",
  alternates: { canonical: "/basketball/source-stats/" },
};

export default function Page() {
  return <Suspense fallback={<p>Loading source statistics…</p>}><SourceStats /></Suspense>;
}
