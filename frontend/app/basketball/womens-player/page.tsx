import { Suspense } from "react";
import WomensPlayerProfile from "./WomensPlayerProfile";

export const metadata = {
  title: "Women’s basketball player production file",
  description: "Exact-ID women’s college basketball player production and game-box evidence.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <Suspense fallback={<p>Loading women&apos;s player file…</p>}><WomensPlayerProfile /></Suspense>;
}
