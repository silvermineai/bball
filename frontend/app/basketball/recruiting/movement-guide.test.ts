import { describe, expect, it } from "vitest";
import { movementEvidenceGuide } from "./movement-guide";

describe("movement evidence guide", () => {
  it("teaches the exact-ID meaning of a changed-program row", () => {
    const rows = movementEvidenceGuide({
      season: 2026,
      status: "different_program",
      matchingCount: 12,
      playersObserved: 80,
    });

    expect(rows.map((row) => row.key)).toEqual(["identity", "status", "workload"]);
    expect(rows[0].observed).toContain("12 matching observations");
    expect(rows[1].establishes).toContain("same retained player ID");
    expect(rows[1].boundary).toContain("does not establish a portal transaction");
    expect(rows[2].boundary).toContain("do not project next-season minutes");
  });

  it("makes new-to-dataset uncertainty explicit", () => {
    const rows = movementEvidenceGuide({
      season: 2027,
      status: "new_to_dataset",
      matchingCount: 1,
      playersObserved: 1,
    });

    expect(rows[1].signal).toBe("New-to-dataset observation");
    expect(rows[1].boundary).toContain("does not establish that the athlete is a freshman");
  });

  it("withholds interpretation when counts cannot reconcile", () => {
    expect(movementEvidenceGuide({
      season: 2026,
      status: "different_program",
      matchingCount: 81,
      playersObserved: 80,
    })).toEqual([]);
    expect(movementEvidenceGuide({
      season: 2026,
      status: "different_program",
      matchingCount: -1,
      playersObserved: 80,
    })).toEqual([]);
  });

  it("withholds the guide when the release season is not valid", () => {
    expect(movementEvidenceGuide({
      season: 1999,
      status: "different_program",
      matchingCount: 1,
      playersObserved: 2,
    })).toEqual([]);
  });
});
