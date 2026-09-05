import { Suspense } from "react";
import Player from "./Player";
export const metadata = {
  title: "Basketball player game log and season statistics",
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading player…</p>}>
      <Player />
    </Suspense>
  );
}
