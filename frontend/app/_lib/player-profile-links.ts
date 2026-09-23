/**
 * Build a production handoff only when the profile carries a valid numeric
 * archive ID. The stat card resolves the same ID in the retained NCAA archive;
 * a name or loosely formatted value must never be used as an identity join.
 */
export function playerProfileStatHref(id: string, season: number): string | null {
  const normalizedId = id.trim();
  if (!/^\d{1,15}$/.test(normalizedId)) return null;
  if (!Number.isSafeInteger(season) || season < 2003 || season > 2026) return null;
  return `/basketball/ncaa-player/?id=${encodeURIComponent(normalizedId)}&season=${encodeURIComponent(String(season))}#shot-profile`;
}
