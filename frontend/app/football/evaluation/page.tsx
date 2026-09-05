import fs from "node:fs";
import path from "node:path";
import Evaluation from "./Evaluation";
export const metadata = {
  title: "Weekly football model experiment and evaluation",
  description:
    "Inspect historical football predictions: preseason versus weekly learning, calibration, monthly results and reproducible training cutoffs.",
  alternates: { canonical: "/football/evaluation/" },
};
export default function Page() {
  const summary = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/evaluation/summary.json"),
      "utf8",
    ),
  );
  return <Evaluation summary={summary} />;
}
