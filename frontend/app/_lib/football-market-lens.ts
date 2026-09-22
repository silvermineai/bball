export type FootballMarketComparison = {
  status: "comparable" | "unavailable";
  marketHomeMargin: number | null;
  difference: number | null;
  text: string;
};

const point = (value: number) => {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
};

/**
 * Explain a football model margin beside an archived home spread without
 * turning an imported line into a current or actionable betting claim.
 *
 * A spread is quoted from the home team's perspective, so -3.0 implies a
 * +3.0 home margin. The archive may be missing a spread or contain a total
 * only; those cases must remain explicitly unavailable.
 */
export function footballMarketComparison(input: {
  homeName: string;
  homeMargin: number | null | undefined;
  homeSpread: number | null | undefined;
}): FootballMarketComparison {
  const homeName = input.homeName.trim() || "The home team";
  if (!Number.isFinite(input.homeMargin) || !Number.isFinite(input.homeSpread)) {
    return {
      status: "unavailable",
      marketHomeMargin: null,
      difference: null,
      text: "No valid home spread is available for this game, so model-to-market margin disagreement is unavailable.",
    };
  }

  const homeMargin = input.homeMargin as number;
  const homeSpread = input.homeSpread as number;
  const marketHomeMargin = -homeSpread;
  const difference = homeMargin - marketHomeMargin;
  const tolerance = 0.05;
  const comparison = Math.abs(difference) <= tolerance
    ? "matches the spread-implied margin"
    : `${point(Math.abs(difference))} points more favorable to ${difference > 0 ? homeName : "the visiting team"} than the spread-implied margin`;

  return {
    status: "comparable",
    marketHomeMargin,
    difference,
    text: `The model's ${homeName} margin is ${point(homeMargin)}; the home spread ${point(homeSpread)} implies a ${point(marketHomeMargin)} ${homeName} margin. The model ${comparison}. This describes disagreement, not a betting return.`,
  };
}
