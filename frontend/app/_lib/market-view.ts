export function normalizeMarketSeason(
  requested: string | null | undefined,
  seasons: number[],
  fallback = "2025",
) {
  if (requested === "all") return "all";
  const parsed = Number(requested);
  return Number.isInteger(parsed) && seasons.includes(parsed)
    ? String(parsed)
    : String(seasons[0] ?? fallback);
}
