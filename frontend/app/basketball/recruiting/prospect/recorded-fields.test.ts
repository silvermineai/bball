import { describe, expect, it } from "vitest";
import { recordedProspectFields, type RecordedProspectFields } from "./recorded-fields";

const prospect: RecordedProspectFields = {
  athlete_id: "42", name: "A. Example", rank: 12, previous_rank: null, grade: 96,
  position: "F", position_rank: 3, state_rank: null, region_rank: 7, status: "committed",
  committed_team_id: "team-1", committed_team_name: "Example State", high_school: null,
  hometown: "Example, AZ", height_inches: 79, weight_pounds: null,
  captured_at: "2026-09-01T00:00:00Z", source_url: "retained://prospect/42",
};

describe("recorded prospect fields", () => {
  it("preserves exact recorded values and makes missing fields explicit", () => {
    const fields = recordedProspectFields(prospect);
    expect(fields.find((field) => field.key === "rank")?.value).toBe("12");
    expect(fields.find((field) => field.key === "previous_rank")?.value).toBe("Unavailable");
    expect(fields.find((field) => field.key === "high_school")?.value).toBe("Unavailable");
    expect(fields.find((field) => field.key === "source_url")?.value).toBe("retained://prospect/42");
  });

  it("withholds external receipt locators from the public field table", () => {
    const fields = recordedProspectFields({ ...prospect, source_url: "https://example.com/prospect/42" });
    expect(fields.find((field) => field.key === "source_url")?.value).toBe("Receipt locator withheld from public view");
  });
});
