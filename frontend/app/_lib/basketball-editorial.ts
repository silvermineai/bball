import type { BBGame } from "./basketball-types";

const factorLabels: Record<string, string> = {
  efg: "shot-making",
  tov: "possession security",
  orb: "offensive rebounding",
  ftr: "free-throw pressure",
};

export type BasketballEditorialLens = {
  title: string;
  body: string;
};

/**
 * Turn the published forecast and Four Factor evidence into a short editorial
 * prompt. This is a writing aid: it describes the stored evidence and never
 * invents injuries, line movement, or a tactical conclusion.
 */
export function basketballEditorialLens(game: BBGame): BasketballEditorialLens | null {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  const width = prediction.margin_high - prediction.margin_low;
  const strongest = Object.entries(game.matchup_factors?.edges || {})
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))[0];
  const factor = strongest ? factorLabels[strongest[0]] : null;
  const edge = strongest ? (strongest[1] as number) : null;
  if (Math.abs(prediction.home_margin) <= 3) {
    return {
      title: "A one-possession question",
      body: `The model has ${game.home_name} within ${Math.abs(prediction.home_margin).toFixed(1)} points of ${game.away_name}; the nominal range spans ${prediction.margin_low.toFixed(1)} to ${prediction.margin_high.toFixed(1)}. Start the preview with the late-game possessions the baseline cannot separate.`,
    };
  }
  if (width >= 24) {
    return {
      title: "Variance belongs in the story",
      body: `The nominal home-margin range covers ${width.toFixed(1)} points, so the forecast is a starting point for preparation rather than a script. Identify which lineup and shot-quality questions could move this game toward either edge.`,
    };
  }
  if (factor && edge != null && Math.abs(edge) >= 0.02) {
    const side = edge > 0 ? game.home_name : game.away_name;
    return {
      title: `${side} owns the ${factor} edge`,
      body: `The latest adjusted Four Factor comparison favors ${side} by ${Math.abs(edge * 100).toFixed(1)} percentage points in ${factor}. Use that gap to choose the first film question, then check whether the recorded personnel can reproduce it.`,
    };
  }
  return {
    title: "Read the baseline in context",
    body: `${game.home_name} is projected at ${prediction.home_score.toFixed(1)} and ${game.away_name} at ${prediction.away_score.toFixed(1)}, with a nominal ${width.toFixed(1)}-point margin range. Pair the score with the source factors before drawing a matchup conclusion.`,
  };
}
