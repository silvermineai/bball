import type { BBGame } from "./basketball-types";
import type { Comparison } from "./research-types";

const factorLabels: Record<string, string> = {
  efg: "shot-making",
  tov: "possession security",
  orb: "offensive rebounding",
  ftr: "free-throw pressure",
};

function marketMagnitude(comparison: Comparison) {
  return Math.abs(comparison.model_difference) *
    (comparison.market === "h2h" ? 100 : 1);
}

function marketLens(game: BBGame): BasketballEditorialLens | null {
  const comparison = [...(game.market_comparisons || [])]
    .filter((row) => Number.isFinite(row.model_difference))
    .sort((a, b) => marketMagnitude(b) - marketMagnitude(a) || a.captured_at.localeCompare(b.captured_at))[0];
  if (!comparison || marketMagnitude(comparison) < (comparison.market === "h2h" ? 2 : 2.5)) return null;
  const magnitude = marketMagnitude(comparison).toFixed(1);
  const direction = comparison.model_difference > 0 ? "above" : "below";
  const marketName = comparison.market === "h2h" ? "home win probability" : comparison.market === "totals" ? "game total" : "home spread";
  const quote = comparison.market === "h2h"
    ? comparison.market_home_probability == null ? "the quoted moneyline" : `${(comparison.market_home_probability * 100).toFixed(1)}% no-vig home probability`
    : comparison.line == null ? "the quoted line" : `${comparison.line > 0 ? "+" : ""}${comparison.line.toFixed(1)}`;
  return {
    title: "A number the market can test",
    body: `The stored ${comparison.bookmaker} ${comparison.market} observation was captured ${comparison.captured_at.slice(0, 10)}. The model sits ${magnitude} ${comparison.market === "h2h" ? "probability points" : "points"} ${direction} ${quote} for the ${marketName}. Treat that gap as a reporting question, not a recommendation; confirm the quote clock and the source context before drawing a conclusion.`,
    questions: [
      `What roster, venue or matchup evidence could explain the ${magnitude}-point model gap in ${marketName}?`,
      "Was the quote captured before the scheduled start and against the same participants as the model record?",
      `After the result is final, did the ${comparison.market} comparison support the model, the market or neither?`,
    ],
  };
}

export type BasketballEditorialLens = {
  title: string;
  body: string;
  questions: string[];
};

/**
 * Turn the published forecast and Four Factor evidence into a short editorial
 * prompt. This is a writing aid: it describes the stored evidence and never
 * invents injuries, line movement, or a tactical conclusion.
 */
export function basketballEditorialLens(game: BBGame): BasketballEditorialLens | null {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  const market = marketLens(game);
  if (market) return market;
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
      questions: [
        "Which team can create a clean look in the final four minutes?",
        "Which handler faces the most pressure when the pace slows?",
        "What dated availability or roster evidence could move this outside one possession?",
      ],
    };
  }
  if (width >= 24) {
    return {
      title: "Variance belongs in the story",
      body: `The nominal home-margin range covers ${width.toFixed(1)} points, so the forecast is a starting point for preparation rather than a script. Identify which lineup and shot-quality questions could move this game toward either edge.`,
      questions: [
        "Which lineup combination gives the underdog its clearest path toward the top of the range?",
        "Can the projected favorite reproduce its best Four Factor possession against this opponent?",
        "Which current roster or availability source should be checked before publication?",
      ],
    };
  }
  if (factor && edge != null && Math.abs(edge) >= 0.02) {
    const side = edge > 0 ? game.home_name : game.away_name;
    return {
      title: `${side} owns the ${factor} edge`,
      body: `The latest adjusted Four Factor comparison favors ${side} by ${Math.abs(edge * 100).toFixed(1)} percentage points in ${factor}. Use that gap to choose the first film question, then check whether the recorded personnel can reproduce it.`,
      questions: [
        `How does ${side} create the ${factor} edge against this opponent?`,
        "Which recorded personnel and lineup evidence can reproduce that advantage?",
        "What would make the opposing defense win that possession battle instead?",
      ],
    };
  }
  return {
    title: "Read the baseline in context",
    body: `${game.home_name} is projected at ${prediction.home_score.toFixed(1)} and ${game.away_name} at ${prediction.away_score.toFixed(1)}, with a nominal ${width.toFixed(1)}-point margin range. Pair the score with the source factors before drawing a matchup conclusion.`,
    questions: [
      "Which Four Factor contrast gives the first defensible story angle?",
      "Which historical contributors need a current availability check?",
      "Which source game, roster row or school statement should anchor the piece?",
    ],
  };
}
