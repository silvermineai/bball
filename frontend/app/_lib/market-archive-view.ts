/**
 * Classify the timing evidence retained with an archival market row.
 *
 * A line can be a well-formed quote and still be unusable for prospective
 * evaluation when it was captured after tip. Keep that distinction visible in
 * the archive instead of calling every retained row a verified pregame quote.
 */
export function marketArchiveTimingLabel(value: number | null | undefined): string {
  if (value === 1) return "Pregame capture";
  if (value === 0) return "Post-tip capture";
  return "Timing unavailable";
}
