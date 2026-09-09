import type { BBGame, BBTeam } from "./basketball-types";

export type BasketballWatchReason =
  | "close"
  | "ranked"
  | "variance"
  | "context";

export type BasketballWatchGame = {
  game: BBGame;
  score: number;
  reason: BasketballWatchReason;
  home_rank: number | null;
  away_rank: number | null;
};

const rankValue = (team: BBTeam | undefined) =>
  team && Number.isFinite(team.rank) && team.rank > 0 ? team.rank : null;

/**
 * Select a small editorial watchlist from published evidence.
 *
 * The score is intentionally bounded and descriptive: close projected margins,
 * wide stored intervals and strong source ranks are easier reasons to open a
 * preview. It never creates a forecast or turns a team rank into a quality
 * claim.
 */
export function selectBasketballWatchlist(
  games: readonly BBGame[],
  ratings: readonly BBTeam[],
  limit = 6,
): BasketballWatchGame[] {
  const byId = new Map(ratings.map((team) => [team.id, team]));
  return games
    .filter((game) => game.prediction != null)
    .map((game) => {
      const prediction = game.prediction!;
      const homeRank = rankValue(byId.get(game.home_id));
      const awayRank = rankValue(byId.get(game.away_id));
      const margin = Math.abs(prediction.home_margin);
      const width = Math.max(0, prediction.margin_high - prediction.margin_low);
      const rankedBonus =
        (homeRank != null && homeRank <= 25 ? 26 - homeRank : 0) +
        (awayRank != null && awayRank <= 25 ? 26 - awayRank : 0);
      const score =
        Math.max(0, 18 - margin) * 3 +
        Math.min(width, 40) * 0.7 +
        rankedBonus * 1.5;
      const reason: BasketballWatchReason =
        margin <= 3.5
          ? "close"
          : homeRank != null &&
              awayRank != null &&
              homeRank <= 25 &&
              awayRank <= 25
            ? "ranked"
            : width >= 24
              ? "variance"
              : "context";
      return {
        game,
        score,
        reason,
        home_rank: homeRank,
        away_rank: awayRank,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.game.starts_at.localeCompare(b.game.starts_at) ||
        a.game.id.localeCompare(b.game.id),
    )
    .slice(0, Math.max(0, limit));
}
