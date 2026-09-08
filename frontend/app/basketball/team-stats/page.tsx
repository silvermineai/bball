import { Suspense } from "react";
import TeamStats from "./TeamStats";

export const metadata = {
  title: "Publisher team-season statistics browser",
  description: "Search attributed ESPN team-season statistics across the college basketball archive.",
  alternates: { canonical: "/basketball/team-stats/" },
};

export default function Page() {
  return <Suspense fallback={<p>Loading team statistics…</p>}><TeamStats /></Suspense>;
}
