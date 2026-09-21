export type RecordedProspectFields = {
  athlete_id: string;
  name: string;
  rank: number | null;
  previous_rank?: number | null;
  grade: number | null;
  position: string | null;
  position_rank: number | null;
  state_rank: number | null;
  region_rank: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  captured_at: string;
  source_url: string;
};

export type RecordedProspectField = { key: keyof RecordedProspectFields | "source_url"; label: string; value: string };

const value = (field: unknown) => field == null || field === "" ? "Unavailable" : String(field);

/** Keep external receipt locators out of the public page while retaining them in the API/archive. */
const publicValue = (key: RecordedProspectField["key"], field: unknown) => {
  const rendered = value(field);
  if (key === "source_url" && /^(?:https?:)?\/\//i.test(rendered)) {
    return "Receipt locator withheld from public view";
  }
  return rendered;
};

export function recordedProspectFields(prospect: RecordedProspectFields): RecordedProspectField[] {
  const rows: Array<[RecordedProspectField["key"], string, unknown]> = [
    ["athlete_id", "Athlete ID", prospect.athlete_id],
    ["name", "Name", prospect.name],
    ["rank", "National rank", prospect.rank],
    ["previous_rank", "Previous rank", prospect.previous_rank],
    ["grade", "Recorded grade", prospect.grade],
    ["position", "Position", prospect.position],
    ["position_rank", "Position rank", prospect.position_rank],
    ["state_rank", "State rank", prospect.state_rank],
    ["region_rank", "Region rank", prospect.region_rank],
    ["status", "Status", prospect.status],
    ["committed_team_id", "Committed team ID", prospect.committed_team_id],
    ["committed_team_name", "Committed team", prospect.committed_team_name],
    ["high_school", "High school", prospect.high_school],
    ["hometown", "Hometown", prospect.hometown],
    ["height_inches", "Height (inches)", prospect.height_inches],
    ["weight_pounds", "Weight (pounds)", prospect.weight_pounds],
    ["captured_at", "Captured at", prospect.captured_at],
    ["source_url", "Retained record locator", prospect.source_url],
  ];
  return rows.map(([key, label, field]) => ({ key, label, value: publicValue(key, field) }));
}
