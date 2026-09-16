import { Suspense } from "react";
import Lineups from "./Lineups";

export const metadata = {
  title: "College basketball lineup combinations and net ratings",
  description: "Browse five-player lineup stints, possessions and opponent-adjusted lineup performance.",
  alternates: { canonical: "/basketball/lineups/" },
};
export default function Page() { return <Suspense fallback={<p>Loading lineup archive…</p>}><Lineups /></Suspense>; }
