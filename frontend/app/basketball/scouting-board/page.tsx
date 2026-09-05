import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import Board from "./Board";
export const metadata = {
  title: "Basketball player scouting board — build your own rankings",
  description:
    "Search 24 seasons of college basketball production, weight your scouting priorities, inspect every ranking and compare three players.",
  alternates: { canonical: "/basketball/scouting-board/" },
};
export default function Page() {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/history/index.json"),
      "utf8",
    ),
  );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The player notebook / Build your board</div>
        <h1>
          What does your
          <br />
          <em>lineup need?</em>
        </h1>
        <p>
          Start with a scouting priority. Adjust the weights, inspect the
          production behind each rank, and take three players into a detailed
          comparison. Explore {catalog.seasons.length} source seasons of men’s
          college basketball.
        </p>
      </div>
      <Suspense fallback={<p role="status">Loading scouting board…</p>}>
        <Board catalog={catalog} />
      </Suspense>
    </>
  );
}
