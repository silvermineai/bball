import { Suspense } from "react";
import NcaaPlayerCard from "./NcaaPlayerCard";

export const metadata = {
  title: "Player card: stats, shooting and recruiting context",
  description: "A player card connecting production, shot profile, roster context and game evidence.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <Suspense fallback={<p>Loading player card…</p>}><NcaaPlayerCard /></Suspense>;
}
