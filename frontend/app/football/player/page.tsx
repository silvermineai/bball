import { Suspense } from "react";
import PlayerDetail from "./PlayerDetail";
export const metadata = {
  title: "Football player game log",
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading player…</p>}>
      <PlayerDetail />
    </Suspense>
  );
}
