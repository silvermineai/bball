import { Suspense } from "react";
import NcaaCompare from "./NcaaCompare";

export const metadata = {
  title: "Compare players: basketball profiles",
  description: "Compare player production, shooting, roster context and exact-ID impact side by side.",
  robots: { index: true, follow: true },
};

export default function Page() {
  return <Suspense fallback={<p>Loading player comparison…</p>}><NcaaCompare /></Suspense>;
}
