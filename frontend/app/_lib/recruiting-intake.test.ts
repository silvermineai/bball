import { describe, expect, it } from "vitest";
import { parseRecruitingCsv, validateRecruitingIntakeCsv } from "./recruiting-intake";

const header = "record_id,season,player_name,player_source_id,from_program,from_program_id,to_program,to_program_id,status,status_date,source_published_on,source_url,source_publisher,captured_at";

describe("recruiting intake preflight", () => {
  it("parses quoted commas and validates a clean export", () => {
    const csv = `${header}\nmove-1,2027,"Doe, Jordan",p1,"Old, U",1,New,2,reported_transfer,2026-05-01,2026-05-02,https://provider.example/row,Provider,2026-05-03T12:00:00Z`;
    expect(parseRecruitingCsv(csv)[1][2]).toBe("Doe, Jordan");
    expect(validateRecruitingIntakeCsv(csv, new Date("2026-06-01T00:00:00Z"))).toMatchObject({ rows: 1, seasons: [2027], errors: [] });
  });

  it("surfaces the checks an operator needs to fix", () => {
    const csv = `${header}\nmove-1,2027,Player,,Old,1,New,2,reported_transfer,2027-06-01,2027-06-01,http://provider.example/row,Provider,2027-06-02T12:00:00Z\nmove-1,2027,Player,,Old,1,New,2,unknown,2027-06-01,2027-06-01,https://provider.example/row,Provider,2027-06-02T12:00:00Z`;
    const result = validateRecruitingIntakeCsv(csv, new Date("2027-01-01T00:00:00Z"));
    expect(result.errors.join(" ")).toContain("HTTPS URL");
    expect(result.errors.join(" ")).toContain("future");
    expect(result.errors.join(" ")).toContain("duplicate record_id");
  });
});
