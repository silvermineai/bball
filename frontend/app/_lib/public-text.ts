/** Keep retained provider copy out of the public reading surface. */
export function publicArchiveText(value: string) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, "archived media")
    .replace(/\bESPN\b/gi, "the reporting desk")
    .replace(/\bNCAA(?:\.com)?\b/gi, "the national archive")
    .replace(/\bSportsDataverse\b/gi, "the archive")
    .replace(/\bCBBD\b/gi, "the archive")
    .replace(/\bCollegeFootballData\b/gi, "the college football archive");
}
