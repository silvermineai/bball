import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { ScoutIndex, ScoutProfile } from "./scouting-types";
const directory = path.join(process.cwd(), "public/data/basketball/scouting");
export const getScoutIndex = cache(
  (): ScoutIndex =>
    JSON.parse(fs.readFileSync(path.join(directory, "index.json"), "utf8")),
);
export const getScoutProfile = cache((id: string): ScoutProfile => {
  if (!/^\d{1,15}$/.test(id)) throw Error("Invalid program identity");
  return JSON.parse(
    fs.readFileSync(path.join(directory, id + ".json"), "utf8"),
  );
});
