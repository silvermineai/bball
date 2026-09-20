import type { LowerFootballResults } from "./football-lower-results";

export type LowerFootballReceiptStatus = "valid" | "unavailable";

export type LowerFootballReadinessRow = {
  division: "d2" | "d3";
  scheduleRows: number;
  completeScoreRows: number;
  scoreCoverage: number | null;
  teamRows: number;
  playerStats: "unavailable";
  predictions: "recorded" | "unavailable";
  receipt: LowerFootballReceiptStatus;
};

const validSha256 = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

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
): LowerFootballReadinessRow[] {
  const receipt = lowerFootballReceiptStatus(archive);
  return (["d2", "d3"] as const).map((division) => {
    const scheduleRows = archive.coverage[division]?.games ?? 0;
    const completeScoreRows = archive.coverage[division]?.score_complete ?? 0;
    return {
      division,
      scheduleRows,
      completeScoreRows,
      scoreCoverage: scheduleRows > 0 ? completeScoreRows / scheduleRows : null,
      teamRows: archive.teams[division]?.length ?? 0,
      playerStats: "unavailable",
      predictions: archive.models[division]?.id && (archive.coverage[division]?.forecast_games ?? 0) > 0 ? "recorded" : "unavailable",
      receipt,
    };
  });
}
