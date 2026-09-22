import type { LowerFootballResults } from "./football-lower-results";

export type LowerFootballReceiptStatus = "valid" | "unavailable";
export type LowerFootballPlayerStatsStatus = "recorded" | "partial" | "unavailable";

/**
 * Observed player evidence is passed in separately from the schedule edition.
 * The optional contract keeps a partial event archive visible without making
 * it look like a complete national-stat release.
 */
export type LowerFootballPlayerEvidence = {
  status: "recorded" | "partial";
  rowsByDivision: Partial<Record<"d2" | "d3", number>>;
  playersByDivision: Partial<Record<"d2" | "d3", number>>;
};

export type LowerFootballReadinessRow = {
  division: "d2" | "d3";
  scheduleRows: number;
  completeScoreRows: number;
  scoreCoverage: number | null;
  teamRows: number;
  playerStats: LowerFootballPlayerStatsStatus;
  upcomingForecastRows: number;
  forecastRows: number;
  forecastCoverage: number | null;
  predictions: "recorded" | "partial" | "unavailable";
  receipt: LowerFootballReceiptStatus;
};

const validSha256 = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const positiveCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * Validate the archive receipt independently of row counts. A schedule can be
 * useful for score context while still failing the receipt gate required for
 * a publishable lower-division player or model edition.
 */
export function lowerFootballReceiptStatus(
  archive: Pick<LowerFootballResults, "season" | "source">,
): LowerFootballReceiptStatus {
  const source = archive.source;
  if (!source || source.dataset !== "schedule" || source.season !== archive.season) return "unavailable";
  if (typeof source.url !== "string" || !source.url.trim()) return "unavailable";
  if (typeof source.fetched_at !== "string" || Number.isNaN(Date.parse(source.fetched_at))) return "unavailable";
  return validSha256(source.sha256) ? "valid" : "unavailable";
}

/**
 * Summarize only the source-native lower football contract. Team records are
 * score-derived archive rows; no player rows, adjusted ratings, or forecasts
 * are inferred from a schedule result.
 */
export function lowerFootballReadiness(
  archive: LowerFootballResults,
  playerEvidence?: LowerFootballPlayerEvidence,
): LowerFootballReadinessRow[] {
  const receipt = lowerFootballReceiptStatus(archive);
  return (["d2", "d3"] as const).map((division) => {
    const scheduleRows = archive.coverage[division]?.games ?? 0;
    const completeScoreRows = archive.coverage[division]?.score_complete ?? 0;
    const rawUpcomingForecastRows = archive.coverage[division]?.upcoming_games ?? 0;
    const upcomingForecastRows = Number.isFinite(rawUpcomingForecastRows) && rawUpcomingForecastRows >= 0 ? rawUpcomingForecastRows : 0;
    const rawForecastRows = archive.coverage[division]?.forecast_games ?? 0;
    const forecastRows = Number.isFinite(rawForecastRows) && rawForecastRows >= 0 ? rawForecastRows : 0;
    const forecastCoverage = upcomingForecastRows > 0 && forecastRows <= upcomingForecastRows ? forecastRows / upcomingForecastRows : null;
    const playerRows = playerEvidence?.rowsByDivision[division];
    const playerCount = playerEvidence?.playersByDivision[division];
    const playerStats = playerEvidence
      && positiveCount(playerRows)
      && positiveCount(playerCount)
      ? playerEvidence.status
      : "unavailable";
    return {
      division,
      scheduleRows,
      completeScoreRows,
      scoreCoverage: scheduleRows > 0 ? completeScoreRows / scheduleRows : null,
      teamRows: archive.teams[division]?.length ?? 0,
      playerStats,
      upcomingForecastRows,
      forecastRows,
      forecastCoverage,
      predictions: archive.models[division]?.id && forecastRows > 0
        ? upcomingForecastRows > 0 && forecastRows <= upcomingForecastRows
          ? forecastRows < upcomingForecastRows ? "partial" : "recorded"
          : "unavailable"
        : "unavailable",
      receipt,
    };
  });
}
