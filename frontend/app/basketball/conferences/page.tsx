import fs from "node:fs";
import path from "node:path";
import Conferences, { type ConferenceRelease } from "./Conferences";

export const metadata = {
  title: "College basketball conference strength and standings",
  description:
    "Compare 32 college basketball conferences by average schedule-adjusted strength and review each league's standings.",
  alternates: { canonical: "/basketball/conferences/" },
};

export default function Page() {
  const data = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/conferences.json"), "utf8"),
  ) as ConferenceRelease;
  return <Conferences data={data} />;
}
