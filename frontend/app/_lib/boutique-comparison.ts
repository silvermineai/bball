/**
 * A boutique archive row can only be compared with an independent rating
 * edition from the same completed season.  Comparing a historical archive
 * season with the current Silvermine table would silently turn a season
 * mismatch into a model disagreement.
 */
export function boutiqueComparisonSeasonMatches(
  selectedSeason: string | number,
  independentSeason: number,
): boolean {
  const selected = typeof selectedSeason === "number"
    ? selectedSeason
    : Number(selectedSeason);
  return Number.isInteger(selected)
    && Number.isInteger(independentSeason)
    && selected >= 2000
    && independentSeason >= 2000
    && selected === independentSeason;
}
