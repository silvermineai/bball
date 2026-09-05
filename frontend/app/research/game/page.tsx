import { Suspense } from "react";
import Game from "./Game";
export const metadata = {
  title: "Forecast history",
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading forecast history…</p>}>
      <Game />
    </Suspense>
  );
}
