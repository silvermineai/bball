export type NotebookIndexGame = {
  id: string;
  startsAt: string;
  awayId: string;
  awayName: string;
  homeId: string;
  homeName: string;
  neutral: boolean;
  timeTbd: boolean;
  forecast: {
    awayScore: number;
    homeScore: number;
    homeWinProbability: number;
    marginLow: number;
    marginHigh: number;
    estimateType: "primary" | "cold_start";
  };
};

const normalized = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Searches the compact notebook index without widening any evidence claim.
 * Every returned row already has a stored primary or labeled cold-start
 * forecast; the browser only changes the reading order.
 */
export function searchNotebookGames(
  games: NotebookIndexGame[],
  query: string,
  limit = 8,
) {
  const terms = normalized(query).split(" ").filter(Boolean);
  return games
    .filter((game) => {
      if (!terms.length) return true;
      const haystack = normalized(
        `${game.awayName} ${game.homeName} ${game.awayId} ${game.homeId} ${game.id}`,
      );
      return terms.every((term) => haystack.includes(term));
    })
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) ||
        a.awayName.localeCompare(b.awayName) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit));
}
