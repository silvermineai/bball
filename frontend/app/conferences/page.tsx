import fs from "node:fs";
import path from "node:path";
import Conferences, { type ConferenceRelease } from "../basketball/conferences/Conferences";

export const metadata = {
  title: "College basketball conferences",
  description: "Conference strength and standings from the published college basketball source edition.",
  alternates: { canonical: "/basketball/conferences/" },
};

export default function Page() {
  const data = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/conferences.json"), "utf8"),
  ) as ConferenceRelease;
  return <Conferences data={data} />;
}
