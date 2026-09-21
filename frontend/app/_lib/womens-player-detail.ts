export type WomensPlayerStat = number | null | undefined;
export type WomensPlayerStats = Record<string, WomensPlayerStat>;
export type WomensPlayerDetailKind = "count" | "rate" | "percentage";
export type WomensPlayerDetailField = readonly [key: string, label: string, kind: WomensPlayerDetailKind];

/**
 * Fields present in the retained women's player-season release but hidden by
 * the compact ranking columns. These are source values; the view never fills
 * a missing field with a derived zero.
 */
export const womensPlayerDetailGroups: ReadonlyArray<{
  label: string;
  fields: readonly WomensPlayerDetailField[];
}> = [
  {
    label: "Per-game production",
    fields: [
      ["gamesPlayed", "Games", "count"],
      ["gamesStarted", "Starts", "count"],
      ["avgMinutes", "Minutes per game", "rate"],
      ["avgPoints", "Points per game", "rate"],
      ["avgRebounds", "Rebounds per game", "rate"],
      ["avgOffensiveRebounds", "Offensive rebounds per game", "rate"],
      ["avgDefensiveRebounds", "Defensive rebounds per game", "rate"],
      ["avgAssists", "Assists per game", "rate"],
      ["avgSteals", "Steals per game", "rate"],
      ["avgBlocks", "Blocks per game", "rate"],
      ["avgTurnovers", "Turnovers per game", "rate"],
      ["avgFouls", "Fouls per game", "rate"],
    ],
  },
  {
    label: "Season totals",
    fields: [
      ["points", "Points", "count"],
      ["totalRebounds", "Rebounds", "count"],
      ["offensiveRebounds", "Offensive rebounds", "count"],
      ["defensiveRebounds", "Defensive rebounds", "count"],
      ["assists", "Assists", "count"],
      ["steals", "Steals", "count"],
      ["blocks", "Blocks", "count"],
      ["turnovers", "Turnovers", "count"],
      ["fouls", "Fouls", "count"],
      ["doubleDouble", "Double-doubles", "count"],
      ["tripleDouble", "Triple-doubles", "count"],
    ],
  },
  {
    label: "Efficiency",
    fields: [
      ["fieldGoalPct", "Field-goal percentage", "percentage"],
      ["threePointFieldGoalPct", "3-point percentage", "percentage"],
      ["freeThrowPct", "Free-throw percentage", "percentage"],
      ["assistTurnoverRatio", "Assist / turnover ratio", "rate"],
      ["stealTurnoverRatio", "Steal / turnover ratio", "rate"],
      ["scoringEfficiency", "Scoring efficiency", "rate"],
      ["shootingEfficiency", "Shooting efficiency", "rate"],
    ],
  },
  {
    label: "Discipline",
    fields: [
      ["technicalFouls", "Technical fouls", "count"],
      ["disqualifications", "Disqualifications", "count"],
      ["ejections", "Ejections", "count"],
    ],
  },
];

const knownFields = new Set(
  womensPlayerDetailGroups.flatMap((group) => group.fields.map(([key]) => key)),
);

/** Read only finite numeric values from a retained source row. */
export function womensPlayerStatValue(stats: WomensPlayerStats, key: string): number | null {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Format a recorded value without implying that missing data is zero. */
export function formatWomensPlayerStat(
  stats: WomensPlayerStats,
  key: string,
  kind: WomensPlayerDetailKind,
): string {
  const value = womensPlayerStatValue(stats, key);
  if (value == null) return "—";
  if (kind === "count") return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (kind === "percentage") return `${value.toFixed(1)}%`;
  return value.toFixed(2);
}

/** Count every populated numeric stat, including future fields in the release. */
export function womensPlayerDetailCount(stats: WomensPlayerStats): number {
  return Object.keys(stats).filter((key) => womensPlayerStatValue(stats, key) != null).length;
}

/** Keep newly published source fields visible instead of silently dropping them. */
export function unlistedWomensPlayerFields(stats: WomensPlayerStats): string[] {
  return Object.keys(stats).filter((key) => !knownFields.has(key));
}

export function womensPlayerFieldLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

/** Return one bounded page without changing the caller's source ordering. */
export function paginateWomensPlayerRows<T>(
  rows: T[],
  page: number,
  pageSize = 100,
): T[] {
  if (!Number.isInteger(pageSize) || pageSize < 1) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;
  return rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
}
