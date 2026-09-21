/**
 * Build the recruiting-fit handoff only from a retained numeric program ID.
 * Player and recruiting namespaces remain separate; this is a team-context
 * link, never a player identity join.
 */
export function recruitingFitHref(teamId: unknown): string | null {
  if (typeof teamId !== "string" || !/^\d{1,15}$/.test(teamId.trim())) return null;
  return `/basketball/recruiting/fit/?team=${encodeURIComponent(teamId.trim())}`;
}
