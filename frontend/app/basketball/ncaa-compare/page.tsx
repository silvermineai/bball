import { Suspense } from "react";
import NcaaCompare from "./NcaaCompare";

export const metadata = {
  title: "Compare NCAA players: source-native basketball profiles",
  description: "Compare NCAA player production, shooting, roster context and exact-ID impact side by side.",
  robots: { index: true, follow: true },
};

export default function Page() {
  return <Suspense fallback={<p>Loading NCAA player comparison…</p>}><NcaaCompare /></Suspense>;
}
