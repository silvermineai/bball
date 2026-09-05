import fs from "node:fs";
import path from "node:path";
import type { BBOverview, BBRosters } from "./basketball-types";
export function getBasketball(): BBOverview {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/overview.json"),
      "utf8",
    ),
  );
}
export function getRosters(): BBRosters {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/rosters.json"),
      "utf8",
    ),
  );
}
