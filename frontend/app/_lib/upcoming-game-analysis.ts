/**
 * Build a compact, source-bound readout for an upcoming forecast.
 *
 * This intentionally describes the published row. It never turns missing
 * roster, availability, schedule, or market data into a neutral assumption.
 */
export type UpcomingGameAnalysisInput = {
  gameId: string | null | undefined;
  homeId?: string | null;
  awayId?: string | null;
  modelId?: string | null;
  prediction?: {
    homeWinProbability?: number | null;
    margin?: number | null;
    scoreHome?: number | null;
    scoreAway?: number | null;
    marginLow?: number | null;
    marginHigh?: number | null;
    estimateType?: string | null;
  } | null;
  schedule?: { date?: string | null; venue?: string | null } | null;
  marketQuoteCount?: number | null;
};

export type UpcomingGameAnalysis = {
  state: "ready" | "partial" | "unavailable";
  identity: { gameId: string | null; homeId: string | null; awayId: string | null };
  estimate: "primary" | "cold-start" | "unavailable";
  lean: "home" | "away" | "toss-up" | "unavailable";
  confidence: "strong" | "lean" | "toss-up" | "unavailable";
  homeWinProbability: number | null;
  margin: number | null;
  scoreHome: number | null;
  scoreAway: number | null;
  marginLow: number | null;
  marginHigh: number | null;
  rangeWidth: number | null;
  uncertainty: "narrow" | "moderate" | "wide" | "unavailable";
  evidence: string[];
  missing: string[];
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sourceId = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

export function buildUpcomingGameAnalysis(
  input: UpcomingGameAnalysisInput,
): UpcomingGameAnalysis {
  const gameId = sourceId(input.gameId);
  const homeId = sourceId(input.homeId);
  const awayId = sourceId(input.awayId);
  const modelId = sourceId(input.modelId);
  const p = input.prediction;
  const probability = finite(p?.homeWinProbability) && p!.homeWinProbability! >= 0 && p!.homeWinProbability! <= 1
    ? p!.homeWinProbability!
    : null;
  const margin = finite(p?.margin) ? p!.margin! : null;
  const scoreHome = finite(p?.scoreHome) ? p!.scoreHome! : null;
  const scoreAway = finite(p?.scoreAway) ? p!.scoreAway! : null;
  const marginLow = finite(p?.marginLow) ? p!.marginLow! : null;
  const marginHigh = finite(p?.marginHigh) ? p!.marginHigh! : null;
  const validRange = marginLow != null && marginHigh != null && marginLow <= marginHigh;
  const rangeWidth = validRange ? marginHigh! - marginLow! : null;
  const validPrediction = probability != null && margin != null && scoreHome != null && scoreAway != null;
  const confidence = probability == null
    ? "unavailable"
    : Math.max(probability, 1 - probability) >= 0.75
      ? "strong"
      : Math.max(probability, 1 - probability) >= 0.6
        ? "lean"
        : "toss-up";
  const lean = probability == null || probability === 0.5
    ? probability == null ? "unavailable" : "toss-up"
    : probability > 0.5 ? "home" : "away";
  const uncertainty = rangeWidth == null
    ? "unavailable"
    : rangeWidth <= 12 ? "narrow" : rangeWidth <= 20 ? "moderate" : "wide";
  const evidence: string[] = [];
  const missing: string[] = [];
  if (validPrediction) evidence.push("published score and win probability");
  else missing.push("a complete finite forecast row");
  if (modelId) evidence.push(`model edition ${modelId}`);
  else missing.push("model edition identity");
  if (gameId && homeId && awayId) evidence.push("exact game and team IDs");
  else missing.push("exact game/team identity");
  if (input.schedule?.date && Number.isFinite(Date.parse(input.schedule.date))) evidence.push("source schedule date");
  else missing.push("parseable source schedule date");
  if (input.schedule?.venue) evidence.push("venue");
  else missing.push("venue");
  if (input.marketQuoteCount == null) missing.push("market quote count");
  else if (Number.isInteger(input.marketQuoteCount) && input.marketQuoteCount > 0) evidence.push(`${input.marketQuoteCount} qualifying market quote${input.marketQuoteCount === 1 ? "" : "s"}`);
  else evidence.push("no qualifying market quote");
  const state = !validPrediction ? "unavailable" : missing.length ? "partial" : "ready";
  return {
    state,
    identity: { gameId, homeId, awayId },
    estimate: !validPrediction ? "unavailable" : p?.estimateType === "cold_start" ? "cold-start" : "primary",
    lean,
    confidence,
    homeWinProbability: probability,
    margin,
    scoreHome,
    scoreAway,
    marginLow: validRange ? marginLow : null,
    marginHigh: validRange ? marginHigh : null,
    rangeWidth,
    uncertainty,
    evidence,
    missing,
  };
}
