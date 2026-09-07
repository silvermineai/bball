export const SPORTS = [
  { code: "s_mbb", sourceCode: "MBB", label: "Men's Basketball", shortLabel: "MBB", detail: "Men's basketball" },
  { code: "s_wbb", sourceCode: "WBB", label: "Women's Basketball", shortLabel: "WBB", detail: "Women's basketball" },
  { code: "s_bsb", sourceCode: "MBA", label: "Baseball", shortLabel: "BSB", detail: "Baseball" },
  { code: "s_sfb", sourceCode: "WSB", label: "Softball", shortLabel: "SFB", detail: "Softball" },
  { code: "s_fbl", sourceCode: "MFB", label: "Football", shortLabel: "FBL", detail: "Football" },
  { code: "s_mso", sourceCode: "MSO", label: "Men's Soccer", shortLabel: "MSO", detail: "Men's soccer" },
  { code: "s_wso", sourceCode: "WSO", label: "Women's Soccer", shortLabel: "WSO", detail: "Women's soccer" },
];

export const DEFAULT_SPORT = "s_mbb";

export function sourceSportCode(sportId: string) {
  return SPORTS.find((sport) => sport.code === sportId)?.sourceCode ?? sportId;
}
