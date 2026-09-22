import fs from "node:fs";
import path from "node:path";
import type { BBOverview, BBRosters, BBRosterModel } from "./basketball-types";
import type { RecruitingRelease } from "./recruiting";
import type { ShotCatalog, ShotSeason } from "./shooting";
import { getLedger } from "./research-data";
import type { Comparison, Ledger } from "./research-types";
import {
  parseArchivedRecruitingRelease,
  type ArchivedRecruitingRelease,
} from "./archived-recruiting";
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

export function getRosterModel(): BBRosterModel {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/roster-model.json"),
      "utf8",
    ),
  );
}

/** Return the retained shooting edition for an exact completed season. */
export function getBasketballShootingSeason(season: number): ShotSeason | null {
  const catalogPath = path.join(
    process.cwd(),
    "public/data/basketball/shooting-catalog.json",
  );
  const fallbackPath = path.join(process.cwd(), "public/data/basketball/shooting.json");
  if (!fs.existsSync(catalogPath) && !fs.existsSync(fallbackPath)) return null;
  const catalog = JSON.parse(
    fs.readFileSync(fs.existsSync(catalogPath) ? catalogPath : fallbackPath, "utf8"),
  ) as ShotCatalog;
  const seasons = catalog.seasons ?? [catalog];
  return seasons.find((entry) => entry.season === season) ?? null;
}

export function getRecruiting(): RecruitingRelease {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/recruiting.json"),
      "utf8",
    ),
  );
}

/**
 * Read the retained prior-season team outlook separately from reviewed
 * school-announcement recruiting evidence. It is useful context, but its
 * season and evidence class must stay visible to callers.
 */
export function getArchivedRecruitingOutlook(): ArchivedRecruitingRelease {
  return parseArchivedRecruitingRelease(JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/recruiting.json"),
      "utf8",
    ),
  ));
}

/**
 * Return only market quotes that the research ledger marked as eligible before
 * the exact scheduled start. The map is intentionally keyed by the source
 * game id so a quote cannot be displayed after a fuzzy team-name join.
 */
export function getBasketballMarketComparisons(): Record<string, Comparison[]> {
  return marketComparisonsForLedger(getLedger());
}

function marketClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function marketComparisonsForLedger(
  ledger: Pick<Ledger, "games">,
): Record<string, Comparison[]> {
  const result: Record<string, Comparison[]> = {};
  for (const game of ledger.games) {
    if (game.sport !== "basketball" || game.exclusion || game.time_tbd) continue;
    const startClock = marketClock(game.starts_at);
    if (startClock == null) continue;
    const comparisons = game.comparisons
      .filter((quote) => {
        const capturedClock = marketClock(quote.captured_at);
        const updatedClock = marketClock(quote.updated_at);
        // A malformed clock or a feed update after capture cannot establish
        // a trustworthy pregame observation. Keep it out of the public handoff
        // rather than letting string ordering make it appear eligible.
        return capturedClock != null
          && updatedClock != null
          && updatedClock <= capturedClock
          && capturedClock < startClock;
      })
      .sort((a, b) => (marketClock(b.captured_at) ?? Number.NEGATIVE_INFINITY) - (marketClock(a.captured_at) ?? Number.NEGATIVE_INFINITY));
    if (comparisons.length) result[game.game_id] = comparisons;
  }
  return result;
}

/** Build the publisher's public game page for a source schedule identifier. */
export function espnGameUrl(gameId: string): string {
  return `https://www.espn.com/mens-college-basketball/game/_/gameId/${encodeURIComponent(gameId)}`;
}
