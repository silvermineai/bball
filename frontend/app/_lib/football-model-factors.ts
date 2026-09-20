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
