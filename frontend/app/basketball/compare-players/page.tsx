import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import ComparePlayers from "./ComparePlayers";
export const metadata = {
  title: "Compare college basketball players and historical seasons",
  description:
    "Compare three player/program seasons with per-40 production, pooled shooting rates, qualified peer percentiles and source game evidence.",
  alternates: { canonical: "/basketball/compare-players/" },
};
export default function Page() {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/history/index.json"),
      "utf8",
    ),
  );
  return (
    <Suspense fallback={<p role="status">Loading player comparison…</p>}>
      <ComparePlayers catalog={catalog} />
    </Suspense>
  );
}
