/** Build stable links from player tables into the exact D1 player card. */
export function ncaaPlayerHref(playerId: string | number, season: number, section?: "shot-profile") {
  const params = new URLSearchParams({
    id: String(playerId),
    season: String(season),
  });
  return `/basketball/ncaa-player/?${params.toString()}${section ? `#${section}` : ""}`;
}

/** Land directly on the coordinate-derived shot visualization. */
export function ncaaPlayerShotHref(playerId: string | number, season: number) {
  return ncaaPlayerHref(playerId, season, "shot-profile");
}
