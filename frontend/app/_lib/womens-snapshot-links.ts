/** Keep the women’s landing snapshot on its own exact-ID routes. */
export function womensSnapshotPlayerHref(playerId: string | number): string {
  return `/basketball/womens-player/?id=${encodeURIComponent(String(playerId))}`;
}

export function womensSnapshotGameHref(gameId: string | number): string {
  return `/basketball/matchups/?gender=women&division=1&game=${encodeURIComponent(String(gameId))}`;
}
