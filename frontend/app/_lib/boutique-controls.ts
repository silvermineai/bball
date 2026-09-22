export type BoutiqueKind = "ratings" | "players";
export type BoutiqueDirection = "asc" | "desc";

/**
 * Publisher rank is conventionally lower-is-better; numeric player value and
 * non-rank team metrics are conventionally shown highest first. An explicit
 * URL direction always wins so shared links remain reproducible.
 */
export function boutiqueInitialDirection(
  kind: BoutiqueKind,
  metric: string,
  requested: string | null,
): BoutiqueDirection {
  if (requested === "asc" || requested === "desc") return requested;
  return kind === "ratings" && metric === "rank" ? "asc" : "desc";
}
