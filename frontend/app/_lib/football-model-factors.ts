import type { Game, Overview } from "./data";

export type FootballModelFactor = {
  intercept: number;
  venue: number;
  home_team: number;
  away_team: number;
  estimate: number;
};

export type FootballModelFactors = {
  margin: FootballModelFactor;
  total: FootballModelFactor;
};

export type FootballModelCalibration = {
  games: number;
  binary_games: number;
  logistic_coefficients: number[];
  margin_half_width: number;
};

export type FootballReliabilityBand = {
  lower: number;
  upper: number;
  games: number;
  predicted: number | null;
  observed: number | null;
};

export type FootballCalibrationReliability = {
  side: "Home" | "Away";
  strongest_probability: number;
  confidence_lower: number;
  confidence_upper: number;
  games: number;
  predicted: number | null;
  observed: number | null;
  observed_gap_pp: number | null;
};

const validReliabilityBand = (band: FootballReliabilityBand) =>
  Number.isFinite(band.lower)
  && Number.isFinite(band.upper)
  && band.upper > band.lower
  && band.lower >= 0
  && band.upper <= 1
  && Number.isInteger(band.games)
  && band.games >= 0
  && (band.predicted == null || (Number.isFinite(band.predicted) && band.predicted >= 0 && band.predicted <= 1))
  && (band.observed == null || (Number.isFinite(band.observed) && band.observed >= 0 && band.observed <= 1));

/**
 * Put a football forecast beside the held-out reliability bin that produced
 * its probability mapping. Away probabilities are inverted so the reader
 * sees the historical hit rate for the side the model actually favors.
 * Empty or malformed bins stay unavailable rather than becoming a made-up
 * confidence claim.
 */
export function footballCalibrationReliability(
  homeWinProbability: number,
  reliability: FootballReliabilityBand[] | null | undefined,
): FootballCalibrationReliability | null {
  if (!Number.isFinite(homeWinProbability) || homeWinProbability < 0 || homeWinProbability > 1 || !Array.isArray(reliability)) return null;
  const band = reliability.find((candidate) => validReliabilityBand(candidate)
    && (homeWinProbability >= candidate.lower)
    && (homeWinProbability < candidate.upper || (homeWinProbability === 1 && candidate.upper === 1)));
  if (!band || band.games <= 0) return null;
  const homeSide = homeWinProbability >= 0.5;
  const predicted = band.predicted == null ? null : homeSide ? band.predicted : 1 - band.predicted;
  const observed = band.observed == null ? null : homeSide ? band.observed : 1 - band.observed;
  return {
    side: homeSide ? "Home" : "Away",
    strongest_probability: Math.max(homeWinProbability, 1 - homeWinProbability),
    confidence_lower: homeSide ? band.lower : 1 - band.upper,
    confidence_upper: homeSide ? band.upper : 1 - band.lower,
    games: band.games,
    predicted,
    observed,
    observed_gap_pp: predicted == null || observed == null ? null : Number(((observed - predicted) * 100).toFixed(1)),
  };
}

/**
 * Keep D1 holdout bins attached to the D1 model scope. A future lower-
 * division model must publish its own reliability artifact before a per-game
 * card can show calibration context.
 */
export function footballCalibrationReliabilityForDivision(
  homeWinProbability: number,
  reliability: FootballReliabilityBand[] | null | undefined,
  division: "d1" | "d2" | "d3",
): FootballCalibrationReliability | null {
  if (division !== "d1") return null;
  return footballCalibrationReliability(homeWinProbability, reliability);
}

/** Explain the registered probability/range mapping without adding a forecast input. */
export function footballCalibrationSummary(calibration?: FootballModelCalibration | null): string | null {
  if (!calibration || !Number.isFinite(calibration.games) || calibration.games <= 0
    || !Number.isFinite(calibration.binary_games) || calibration.binary_games < 0
    || !Array.isArray(calibration.logistic_coefficients) || calibration.logistic_coefficients.length !== 2
    || !calibration.logistic_coefficients.every(finite)
    || !Number.isFinite(calibration.margin_half_width) || calibration.margin_half_width <= 0) return null;
  return `Home-win probability is a logistic mapping of modeled margin, calibrated on ${calibration.binary_games.toLocaleString()} binary games; the published 80% margin range uses a ${calibration.margin_half_width.toFixed(1)}-point half-width.`;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Decompose the published ridge estimate using its registered feature order. */
export function footballModelFactors(
  model: Pick<Overview["model"], "teams" | "margin_coef" | "total_coef">,
  game: Pick<Game, "home_id" | "away_id" | "neutral">,
): FootballModelFactors | null {
  if (!Array.isArray(model.teams) || !Array.isArray(model.margin_coef) || !Array.isArray(model.total_coef)) return null;
  const homeIndex = model.teams.indexOf(game.home_id);
  const awayIndex = model.teams.indexOf(game.away_id);
  if (homeIndex < 0 || awayIndex < 0) return null;
  const homeCoefficient = homeIndex + 2;
  const awayCoefficient = awayIndex + 2;
  const margin = model.margin_coef;
  const total = model.total_coef;
  const values = [margin[0], margin[1], margin[homeCoefficient], margin[awayCoefficient], total[0], total[1], total[homeCoefficient], total[awayCoefficient]];
  if (!values.every(finite)) return null;
  const venue = game.neutral ? 0 : 1;
  return {
    margin: {
      intercept: margin[0],
      venue: venue * margin[1],
      home_team: margin[homeCoefficient],
      away_team: -margin[awayCoefficient],
      estimate: margin[0] + venue * margin[1] + margin[homeCoefficient] - margin[awayCoefficient],
    },
    total: {
      intercept: total[0],
      venue: venue * total[1],
      home_team: total[homeCoefficient],
      away_team: total[awayCoefficient],
      estimate: total[0] + venue * total[1] + total[homeCoefficient] + total[awayCoefficient],
    },
  };
}
