import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Features from "./Features";
import type { FeatureSummary } from "../../_lib/football-features";
export const metadata = {
  title: "Do efficiency statistics improve football forecasts?",
  description:
    "A reproducible historical test of prior-game EPA and yards per play against a score-only correction, with separate training, calibration and evaluation seasons.",
  alternates: { canonical: "/football/features/" },
};
export default function Page() {
  const summary: FeatureSummary = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/features/summary.json"),
      "utf8",
    ),
  );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Experiment 02 / What the extra statistics add
        </div>
        <h1>
          More information.
          <br />A better forecast?
        </h1>
        <p>
          Test prior-game EPA and yards per play against a score-only correction
          on the same {summary.coverage.evaluation_games} historical games.
          Correction models train on 2023; probabilities are calibrated in 2024;
          this comparison scores the 2025 season.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/football/efficiency/">
            Explore the source statistics ↗
          </Link>
          <Link className="hero-link" href="/football/evaluation/">
            The original weekly experiment →
          </Link>
        </div>
      </div>
      <Features summary={summary} />
    </>
  );
}
