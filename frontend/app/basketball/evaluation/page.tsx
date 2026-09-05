import fs from "node:fs";
import path from "node:path";
import Evaluation from "./Evaluation";
export const metadata = {
  title: "Weekly basketball model experiment and evaluation",
  description:
    "Inspect 5,734 historical basketball predictions: preseason versus weekly learning, calibration, monthly results and reproducible training cutoffs.",
  alternates: { canonical: "/basketball/evaluation/" },
};
export default function Page() {
  const summary = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "public/data/basketball/evaluation/summary.json",
      ),
      "utf8",
    ),
  );
  return <Evaluation summary={summary} />;
}
