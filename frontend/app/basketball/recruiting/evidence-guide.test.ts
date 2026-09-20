import { describe, expect, it } from "vitest";
import type { RecordedSchoolProgram } from "../../_lib/recorded-school-board";
import { recruitingEvidenceGuide } from "./evidence-guide";

const result = () => ({
  season: 2027,
  total: 100,
  edition: "edition-2027",
  cohort: { committed: 25, ranked: 80, graded: 90 },
  field_coverage: { total: 100, committed_team: 25 },
  rank_quality: {
    ranked_rows: 80,
    tied_rank_values: 2,
    tied_rows: 5,
    withheld_placeholder_rows: 3,
  },
});

const school = (overrides: Partial<RecordedSchoolProgram> = {}): RecordedSchoolProgram => ({
  edition: "edition-2027",
  school_id: "150",
  prospect_total: 8,
  uncommitted_total: 5,
  committed_here_total: 2,
  ranked_total: 7,
  top100_total: 4,
  best_rank: 8,
  average_rank: 73.4,
  position_breakdown: [{ position: "PG", total: 8 }],
  name: "Duke",
  resolved: true,
  ...overrides,
});

describe("recruiting evidence guide", () => {
  it("turns exact board fields into a four-step methodology", () => {
    const rows = recruitingEvidenceGuide(result(), [
      school(),
      school({ school_id: "200", prospect_total: 4, name: "Other" }),
    ]);

    expect(rows.map((row) => row.key)).toEqual([
      "rank",
      "school-list",
      "commitment",
      "workload",
    ]);
    expect(rows[0].observed).toContain("2 tied values across 5 rows");
    expect(rows[1].observed).toContain("12 appearances");
    expect(rows[2].observed).toContain("25 of 100");
    expect(rows[3].observed).toBe("Not a field in this prospect-ranking release");
  });

  it("withholds rank interpretation when tie counts are impossible", () => {
    const invalid = result();
    invalid.rank_quality = {
      ...invalid.rank_quality,
      tied_rank_values: 3,
      tied_rows: 5,
    };

    expect(recruitingEvidenceGuide(invalid, [school()]).map((row) => row.key)).toEqual([
      "school-list",
      "commitment",
      "workload",
    ]);
  });

  it("withholds commitment interpretation when its exact denominator disagrees", () => {
    const invalid = result();
    invalid.field_coverage = { total: 99, committed_team: 25 };

    expect(recruitingEvidenceGuide(invalid, [school()]).map((row) => row.key)).toEqual([
      "rank",
      "school-list",
      "workload",
    ]);
  });

  it("withholds mixed-edition school rows", () => {
    expect(
      recruitingEvidenceGuide(result(), [school({ edition: "older" })]).map(
        (row) => row.key,
      ),
    ).toEqual(["rank", "commitment", "workload"]);
  });

  it("withholds the guide without a reproducible edition", () => {
    expect(recruitingEvidenceGuide({ ...result(), edition: null }, [school()])).toEqual([]);
  });
});
