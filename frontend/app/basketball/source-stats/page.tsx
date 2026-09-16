import { Suspense } from "react";
import SourceStats from "./SourceStats";

export const metadata = {
  title: "College basketball player statistics browser",
  description: "Search every retained player-season field in the Silvermine college basketball archive.",
  alternates: { canonical: "/basketball/source-stats/" },
};

export default function Page() {
  return <Suspense fallback={<p>Loading player statistics…</p>}><SourceStats /></Suspense>;
}
