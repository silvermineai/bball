export type WomensPlayerStat = number | null | undefined;
export type WomensPlayerStats = Record<string, WomensPlayerStat>;
export type WomensPlayerCsvRecord = {
  player_id: string;
  name: string;
  team: string;
  position: string;
  source: "season" | "box" | "season+box";
  box_rows?: number;
  dnp_rows?: number;
  stats: WomensPlayerStats;
};

export type WomensPlayerBoxAggregate = {
  games_played: number;
  starts: number;
  totals: Record<string, number | null | undefined>;
  per_game: Record<string, number | null | undefined>;
  shooting: {
    field_goal_pct: number | null | undefined;
    three_point_pct: number | null | undefined;
    free_throw_pct: number | null | undefined;
  };
};

/**
 * Map the retained game-box aggregate to the public player-table vocabulary.
 * Keeping this mapping in one place prevents a source merge from silently
 * dropping a box field or giving it a different meaning in CSV and display.
 */
export function womensBoxDisplayStats(box: WomensPlayerBoxAggregate): WomensPlayerStats {
  return {
    gamesPlayed: box.games_played,
    gamesStarted: box.starts,
    avgMinutes: box.per_game.minutes,
    avgPoints: box.per_game.points,
    avgRebounds: box.per_game.rebounds,
    avgOffensiveRebounds: box.per_game.offensive_rebounds,
    avgDefensiveRebounds: box.per_game.defensive_rebounds,
    avgAssists: box.per_game.assists,
    avgSteals: box.per_game.steals,
    avgBlocks: box.per_game.blocks,
    avgTurnovers: box.per_game.turnovers,
    avgFouls: box.per_game.fouls,
    points: box.totals.points,
    totalRebounds: box.totals.rebounds,
    offensiveRebounds: box.totals.offensive_rebounds,
    defensiveRebounds: box.totals.defensive_rebounds,
    assists: box.totals.assists,
    steals: box.totals.steals,
    blocks: box.totals.blocks,
    turnovers: box.totals.turnovers,
    fouls: box.totals.fouls,
    fieldGoalsMade: box.totals.field_goals_made,
    fieldGoalsAttempted: box.totals.field_goals_attempted,
    threePointFieldGoalsMade: box.totals.three_point_field_goals_made,
    threePointFieldGoalsAttempted: box.totals.three_point_field_goals_attempted,
    freeThrowsMade: box.totals.free_throws_made,
    freeThrowsAttempted: box.totals.free_throws_attempted,
    fieldGoalPct: box.shooting.field_goal_pct,
    threePointFieldGoalPct: box.shooting.three_point_pct,
    freeThrowPct: box.shooting.free_throw_pct,
  };
}

/**
 * Merge two exact-ID sources without turning a missing box cell into zero.
 * Game-box values are preferred for overlapping fields because they are
 * arithmetic aggregates of the selected observed season; season-release
 * fields remain available when the box release did not carry that measure.
 */
export function mergeWomensPlayerStats(
  seasonStats: WomensPlayerStats,
  boxStats: WomensPlayerStats,
): WomensPlayerStats {
  const merged: WomensPlayerStats = { ...seasonStats };
  for (const [key, value] of Object.entries(boxStats)) {
    if (typeof value === "number" && Number.isFinite(value)) merged[key] = value;
  }
  return merged;
}

export type WomensPlayerSourceCoverage = {
  /** Unique exact IDs in the bounded player-season release. */
  seasonIds: number;
  /** Unique exact IDs in the retained game-box archive. */
  boxIds: number;
  /** IDs present in both releases; this is an exact-ID overlap, not a name join. */
  overlapIds: number;
  seasonOnlyIds: number;
  boxOnlyIds: number;
  uniqueIds: number;
};

/**
 * Describe the player cohorts behind the women’s table without conflating
 * source rows or joining on names. The two releases can overlap by exact
 * publisher athlete ID, while each also contains IDs the other does not.
 */
export function womensPlayerSourceCoverage(
  seasonPlayers: readonly { player_id: string | number | null | undefined }[],
  boxPlayers: readonly { player_id: string | number | null | undefined }[],
): WomensPlayerSourceCoverage {
  const ids = (rows: readonly { player_id: string | number | null | undefined }[]) =>
    new Set(rows.map((row) => String(row.player_id ?? "").trim()).filter(Boolean));
  const seasonIds = ids(seasonPlayers);
  const boxIds = ids(boxPlayers);
  const overlapIds = [...seasonIds].filter((id) => boxIds.has(id)).length;
  return {
    seasonIds: seasonIds.size,
    boxIds: boxIds.size,
    overlapIds,
    seasonOnlyIds: seasonIds.size - overlapIds,
    boxOnlyIds: boxIds.size - overlapIds,
    uniqueIds: new Set([...seasonIds, ...boxIds]).size,
  };
}
export type WomensPlayerDetailKind = "count" | "rate" | "percentage";
export type WomensPlayerDetailField = readonly [key: string, label: string, kind: WomensPlayerDetailKind];

/**
 * Context fields kept visible in the primary player table. These are source
 * values shared by the season and game-box player releases, so the table can
 * show role and rebounding shape without deriving a value or joining names.
 */
export const womensPlayerTableContextFields = [
  ["gamesStarted", "GS"],
  ["avgOffensiveRebounds", "ORB/G"],
  ["avgDefensiveRebounds", "DRB/G"],
] as const;

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
    label: "Shooting totals",
    fields: [
      ["fieldGoalsMade", "Field goals made", "count"],
      ["fieldGoalsAttempted", "Field goals attempted", "count"],
      ["threePointFieldGoalsMade", "3-pointers made", "count"],
      ["threePointFieldGoalsAttempted", "3-pointers attempted", "count"],
      ["freeThrowsMade", "Free throws made", "count"],
      ["freeThrowsAttempted", "Free throws attempted", "count"],
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

const orderedDetailFields = womensPlayerDetailGroups.flatMap((group) => group.fields.map(([key]) => key));

/**
 * Preserve the published detail-field order, then append any fields introduced
 * by a newer release. This keeps CSV output stable while retaining new data.
 */
export function orderedWomensPlayerStatFields(players: readonly WomensPlayerCsvRecord[]): string[] {
  const present = new Set(players.flatMap((player) => Object.keys(player.stats)));
  return [
    ...orderedDetailFields.filter((key) => present.has(key)),
    ...Array.from(present).filter((key) => !orderedDetailFields.includes(key)).sort(),
  ];
}

export function womensPlayerCsvHeaders(statFields: readonly string[]): string[] {
  return ["Player ID", "Player", "Team", "Position", "Source", "Box rows", "DNP rows", ...statFields.map(womensPlayerFieldLabel)];
}

/**
 * Export only finite source values. Null, undefined, and non-finite values are
 * blank cells so an unavailable stat is never represented as zero.
 */
export function womensPlayerCsvRows(
  players: readonly WomensPlayerCsvRecord[],
  statFields: readonly string[],
): Array<Array<string | number | null>> {
  return players.map((player) => [
    player.player_id,
    player.name,
    player.team,
    player.position,
    player.source,
    player.box_rows ?? null,
    player.dnp_rows ?? null,
    ...statFields.map((key) => {
      const value = player.stats[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
  ]);
}

const knownFields = new Set(
  womensPlayerDetailGroups.flatMap((group) => group.fields.map(([key]) => key)),
);

/** Read only finite numeric values from a retained source row. */
export function womensPlayerStatValue(stats: WomensPlayerStats, key: string): number | null {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Sort player rows by one retained statistic without collapsing a recorded
 * zero into the unavailable bucket. Missing and non-finite values stay at the
 * bottom; name and exact source ID make ties deterministic across releases.
 */
export function compareWomensPlayerRows(
  left: { player_id: string; name: string; stats: WomensPlayerStats },
  right: { player_id: string; name: string; stats: WomensPlayerStats },
  key: string,
): number {
  const leftValue = womensPlayerStatValue(left.stats, key);
  const rightValue = womensPlayerStatValue(right.stats, key);
  if (leftValue == null && rightValue != null) return 1;
  if (leftValue != null && rightValue == null) return -1;
  if (leftValue != null && rightValue != null && leftValue !== rightValue) {
    return rightValue - leftValue;
  }
  return left.name.localeCompare(right.name)
    || String(left.player_id).localeCompare(String(right.player_id));
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
