import { describe, expect, it } from "vitest";
import { formatProspectSize, prospectCountLabel, prospectCsvHeaders, prospectCsvRows } from "./LiveBasketballProspectLeaders";

describe("prospect size formatting", () => {
  it("renders the recorded height and weight together", () => {
    expect(formatProspectSize({ athlete_id: "1", name: "Guard", height_inches: 75, weight_pounds: 185 })).toBe("6'3\" · 185 lb");
  });

  it("keeps missing measurements unavailable", () => {
    expect(formatProspectSize({ athlete_id: "2", name: "Forward" })).toBe("—");
  });
});


describe("prospect class labels", () => {
  it("uses the selected class in the count label", () => {
    expect(prospectCountLabel(254, 2028)).toBe("254 prospects in the 2028 class");
  });
});

describe("prospect CSV export", () => {
  it("retains movement, destination and physical fields", () => {
    const rows = prospectCsvRows([{
      athlete_id: "42",
      name: "Guard",
      rank: 12,
      previous_rank: 18,
      position: "PG",
      grade: 94.5,
      committed_team_id: "150",
      committed_team_name: "Example",
      height_inches: 75,
      weight_pounds: 185,
      captured_at: "2026-09-17T00:00:00Z",
    }], 2027);
    expect(prospectCsvHeaders).toContain("Movement");
    expect(rows[0].slice(0, 8)).toEqual([2027, 12, 18, "▲ 6", "42", "Guard", "PG", 94.5]);
    expect(rows[0].slice(12)).toEqual(["150", "Example", null, null, 75, 185, "2026-09-17T00:00:00Z"]);
  });
});
