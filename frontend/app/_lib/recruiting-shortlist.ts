export type RecruitingShortlistEntry = {
  key: string;
  season: string;
  athlete_id: string;
  name: string;
  position: string | null;
  rank: number | null;
  grade: number | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  source_url: string;
  edition?: string | null;
  captured_at?: string | null;
};

export const RECRUITING_SHORTLIST_STORAGE_KEY = "silvermine:recruiting-shortlist:v1";

export const recruitingShortlistKey = (season: string, athleteId: string) => `${season}:${athleteId}`;

const isString = (value: unknown): value is string => typeof value === "string";
const nullableString = (value: unknown) => isString(value) ? value : null;
const nullableNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function readRecruitingShortlist(raw: string | null): RecruitingShortlistEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: RecruitingShortlistEntry[] = [];
    const seen = new Set<string>();
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (!isString(row.key) || !/^\d{4}:\d{1,15}$/.test(row.key) || seen.has(row.key)) continue;
      if (!isString(row.season) || !/^\d{4}$/.test(row.season)) continue;
      if (!isString(row.athlete_id) || !/^\d{1,15}$/.test(row.athlete_id)) continue;
      if (!isString(row.name) || !row.name.trim() || !isString(row.source_url)) continue;
      seen.add(row.key);
      entries.push({
        key: row.key,
        season: row.season,
        athlete_id: row.athlete_id,
        name: row.name,
        position: nullableString(row.position),
        rank: nullableNumber(row.rank),
        grade: nullableNumber(row.grade),
        committed_team_id: nullableString(row.committed_team_id),
        committed_team_name: nullableString(row.committed_team_name),
        high_school: nullableString(row.high_school),
        source_url: row.source_url,
        edition: nullableString(row.edition),
        captured_at: nullableString(row.captured_at),
      });
    }
    return entries.slice(0, 100);
  } catch {
    return [];
  }
}

export function toggleRecruitingShortlist(
  entries: RecruitingShortlistEntry[],
  entry: RecruitingShortlistEntry,
): RecruitingShortlistEntry[] {
  const index = entries.findIndex((value) => value.key === entry.key);
  if (index >= 0) return entries.filter((value) => value.key !== entry.key);
  return [entry, ...entries].slice(0, 100);
}
