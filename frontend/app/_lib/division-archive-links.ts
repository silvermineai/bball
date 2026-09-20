/**
 * Build links into the source-native lower-division archives.
 *
 * These routes intentionally land on the scoped archive pages instead of the
 * D1 research card. The division is part of the URL so an exact NCAA ID can
 * never silently be interpreted in another cohort.
 */
export type LowerBasketballDivision = "2" | "3";

const archiveId = (value: string | number) => {
  const normalized = String(value);
  if (!/^\d{1,15}$/.test(normalized)) throw new Error("Archive IDs must be numeric NCAA IDs.");
  return normalized;
};

export function lowerDivisionPlayerHref(division: LowerBasketballDivision, playerId: string | number) {
  return `/basketball/ncaa/?division=${division}&player=${encodeURIComponent(archiveId(playerId))}`;
}

export function lowerDivisionTeamHref(division: LowerBasketballDivision, teamId: string | number) {
  return `/basketball/ratings/?division=${division}&team=${encodeURIComponent(archiveId(teamId))}`;
}
