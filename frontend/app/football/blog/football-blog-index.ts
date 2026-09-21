import type { Game } from "../../_lib/data";

/** Keep the notebook queue bound to exact, forecasted rows in the published slate. */
export function selectFootballBlogGames(games: Game[], limit = 24): Game[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  return games
    .filter((game) => Boolean(game.id?.trim()) && Number.isFinite(Date.parse(game.kickoff)) && game.prediction != null)
    .sort((left, right) => left.kickoff.localeCompare(right.kickoff) || left.id.localeCompare(right.id))
    .slice(0, limit);
}
