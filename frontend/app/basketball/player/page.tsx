import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import Player from "./Player";
export const metadata = {
  title: "Basketball player game log and season statistics",
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading player…</p>}>
      <Player
        catalog={JSON.parse(
          fs.readFileSync(
            path.join(
              process.cwd(),
              "public/data/basketball/history/index.json",
            ),
            "utf8",
          ),
        )}
      />
    </Suspense>
  );
}
