export type FootballMarketStatusSnapshot = {
  qualifyingMarketObservations: number;
  marketObservations: number;
  gamesWithComparisons: number;
  settledMarketComparisons: number;
  settledModelGames: number;
  winnerAccuracy: number | null;
  marginMae: number | null;
};

export type FootballMarketCapture = {
  summary_count?: number;
  summary_with_pickcenter?: number;
  accepted_markets?: number;
  rejected_records?: number;
};

const count = (value: number) => Number.isFinite(value) && value >= 0 ? Math.trunc(value).toLocaleString() : "—";
const metric = (value: number | null, suffix = "") => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}${suffix}`;

/** Explain the market ledger without treating pending quotes as settled results. */
export function footballMarketStatusDetail(snapshot: FootballMarketStatusSnapshot): string {
  const retained = `${count(snapshot.marketObservations)} retained market rows`;
  const market = snapshot.qualifyingMarketObservations > 0
    ? `${count(snapshot.qualifyingMarketObservations)} qualifying pregame quote observations across ${count(snapshot.gamesWithComparisons)} games from ${retained}`
    : "no qualifying pregame quote observations";
  const model = `The model alone is ${metric(snapshot.winnerAccuracy == null ? null : snapshot.winnerAccuracy * 100, "%")} on winner picks with ${metric(snapshot.marginMae)}-point margin MAE across ${count(snapshot.settledModelGames)} settled forecasts`;
  if (snapshot.settledMarketComparisons > 0) {
    return `Live market ledger: ${market}. ${count(snapshot.settledMarketComparisons)} settled model-to-line comparisons are available; open the scorecard for market-by-market errors. ${model}.`;
  }
  if (snapshot.qualifyingMarketObservations > 0) {
    return `Live market ledger: ${market}. No settled model-to-line comparison is available yet, so line accuracy is pending. ${model}.`;
  }
  return `Live market ledger has ${market}. ${model}.`;
}

/** Explain the latest connector receipt without treating an empty capture as an empty market. */
export function footballMarketCaptureDetail(capture: FootballMarketCapture | null | undefined): string {
  const checked = Number.isInteger(capture?.summary_count) && (capture?.summary_count || 0) >= 0
    ? capture?.summary_count || 0
    : null;
  if (checked == null) return "";
  const quoted = Number.isInteger(capture?.summary_with_pickcenter) && (capture?.summary_with_pickcenter || 0) >= 0
    ? capture?.summary_with_pickcenter || 0
    : null;
  const accepted = Number.isInteger(capture?.accepted_markets) && (capture?.accepted_markets || 0) >= 0
    ? capture?.accepted_markets || 0
    : null;
  const rejected = Number.isInteger(capture?.rejected_records) && (capture?.rejected_records || 0) >= 0
    ? capture?.rejected_records || 0
    : null;
  const quoteText = quoted == null ? "quote coverage was not reported" : `${quoted.toLocaleString()} included complete market quotes`;
  const acceptedText = accepted == null ? "" : `; ${accepted.toLocaleString()} passed validation`;
  const rejectedText = rejected == null || rejected === 0 ? "" : `; ${rejected.toLocaleString()} records were rejected`;
  return `The latest connector capture checked ${checked.toLocaleString()} future game summaries; ${quoteText}${acceptedText}${rejectedText}.`;
}
