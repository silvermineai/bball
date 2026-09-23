import type { CsvCell } from "./csv";
import type { WomensRecruitingProspect, WomensRecruitingRelease } from "./womens-recruiting-intel";

export const womensRecruitingBoardCsvHeaders = [
  "Class", "Athlete ID", "Prospect", "Position", "National rank", "Position rank", "State rank", "Region rank", "Grade", "Status", "Destination ID", "Destination", "High school", "Hometown", "Height (in)", "Weight (lb)", "Release edition", "Captured", "List receipt SHA-256",
] as const;

/** Preserve every displayed recruiting field and the release receipt in CSV form. */
export function womensRecruitingBoardCsvRows(
  records: readonly WomensRecruitingProspect[],
  release: WomensRecruitingRelease,
): CsvCell[][] {
  return records.map((record) => [
    release.season,
    record.athlete_id,
    record.name,
    record.position ?? null,
    record.rank ?? null,
    record.position_rank ?? null,
    record.state_rank ?? null,
    record.region_rank ?? null,
    record.grade ?? null,
    record.status ?? null,
    record.committed_team_id ?? null,
    record.committed_team_name ?? null,
    record.high_school ?? null,
    record.hometown ?? null,
    record.height_inches ?? null,
    record.weight_pounds && record.weight_pounds > 0 ? record.weight_pounds : null,
    release.edition,
    release.captured_at,
    release.source.list_sha256,
  ]);
}
