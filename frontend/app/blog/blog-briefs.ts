import type { BBGame } from "../_lib/basketball-types";

/**
 * Keep the journal's matchup index on the basketball release. A fallback
 * estimate is still a useful, explicitly labeled reading entry when the
 * primary team field is outside the trained set.
 */
export function publishedBasketballBlogGames(games: BBGame[]): BBGame[] {
  return games.filter((game) => Boolean(game.prediction || game.fallback_prediction));
}

/** Build the canonical route for a basketball notebook from its exact game ID. */
export function basketballBlogHref(gameId: string): string {
  return `/blog/basketball-game-${encodeURIComponent(gameId)}/`;
}
