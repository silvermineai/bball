export type FootballRecruitingDivision = "all" | "fbs" | "fcs" | "d2" | "d3" | "naia" | "unknown";

const divisions = new Set<FootballRecruitingDivision>([
  "all",
  "fbs",
  "fcs",
  "d2",
  "d3",
  "naia",
  "unknown",
]);

/**
 * Translate the site-wide D1/D2/D3 URL vocabulary into the values expected by
 * the football personnel API. D1 intentionally means the complete D1 desk,
 * where readers can further split FBS and FCS with the local control.
 */
export function parseFootballRecruitingDivision(value: string | null): FootballRecruitingDivision {
  if (value === "2") return "d2";
  if (value === "3") return "d3";
  if (value === "1" || value == null || value === "") return "all";
  return divisions.has(value as FootballRecruitingDivision)
    ? value as FootballRecruitingDivision
    : "all";
}

/** Keep D2/D3 URLs compatible with the persistent sport-level scope control. */
export function footballRecruitingDivisionParam(division: FootballRecruitingDivision): string | null {
  if (division === "all") return null;
  if (division === "d2") return "2";
  if (division === "d3") return "3";
  return division;
}
