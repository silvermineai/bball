import type { BasketballLeaderMetric } from "./basketball-leaders";

export type BasketballLeaderCard = {
  metric: BasketballLeaderMetric;
  label: string;
  description: string;
  percent?: boolean;
};

/**
 * Measures safe for the compact season archive on the landing board.
 *
 * The compact release keeps 3P% and FT%, but does not retain their attempt
 * totals. Those rates belong on the live national table, where the API can
 * apply explicit volume floors and expose the matching denominators.
 */
export const compactBasketballLeaderCards: BasketballLeaderCard[] = [
  { metric: "ppg", label: "Scoring", description: "points per game" },
  { metric: "rpg", label: "Rebounding", description: "rebounds per game" },
  { metric: "apg", label: "Playmaking", description: "assists per game" },
  { metric: "spg", label: "Steals", description: "steals per game" },
  { metric: "bpg", label: "Rim protection", description: "blocks per game" },
  { metric: "ts", label: "True shooting", description: "scoring efficiency", percent: true },
  { metric: "efg", label: "Effective FG", description: "shot efficiency", percent: true },
];

