import fs from "node:fs";
import path from "node:path";
import type { BBOverview, BBRosters, BBRosterModel } from "./basketball-types";
import type { RecruitingRelease } from "./recruiting";
import type { ShotCatalog, ShotSeason } from "./shooting";
import { getLedger } from "./research-data";
import type { Comparison, Ledger } from "./research-types";
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
 * Return only market quotes that the research ledger marked as eligible before
 * the exact scheduled start. The map is intentionally keyed by the source
 * game id so a quote cannot be displayed after a fuzzy team-name join.
 */
export function getBasketballMarketComparisons(): Record<string, Comparison[]> {
  return marketComparisonsForLedger(getLedger());
}

export function marketComparisonsForLedger(
  ledger: Pick<Ledger, "games">,
): Record<string, Comparison[]> {
  const result: Record<string, Comparison[]> = {};
  for (const game of ledger.games) {
    if (game.sport !== "basketball" || game.exclusion || game.time_tbd) continue;
    const comparisons = game.comparisons
      .filter((quote) => quote.captured_at < game.starts_at)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
    if (comparisons.length) result[game.game_id] = comparisons;
  }
  return result;
}

/** Build the publisher's public game page for a source schedule identifier. */
export function espnGameUrl(gameId: string): string {
  return `https://www.espn.com/mens-college-basketball/game/_/gameId/${encodeURIComponent(gameId)}`;
}
