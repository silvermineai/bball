import fs from "node:fs";
import path from "node:path";
import type { BBOverview, BBRosters } from "./basketball-types";
import type { RecruitingRelease } from "./recruiting";
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

export function getRecruiting(): RecruitingRelease {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/recruiting.json"),
      "utf8",
    ),
  );
}

/** Build the publisher's public game page for a source schedule identifier. */
export function espnGameUrl(gameId: string): string {
  return `https://www.espn.com/mens-college-basketball/game/_/gameId/${encodeURIComponent(gameId)}`;
}
