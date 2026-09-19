import { describe, expect, it } from "vitest";
import {
  validateCompletePlayerProfileExport,
  validatePlayerProfileExportPage,
} from "./player-profile-export";

const row = (id: string, team_id = "7", season = 2026) => ({
  id,
  season,
  team_id,
});

const page = (rows: ReturnType<typeof row>[], pageNumber = 0, total = 3) => ({
  season: 2026 as const,
  page: pageNumber,
  page_size: 2,
  total,
  rows,
});

describe("player profile export validation", () => {
  it("accepts stable pages and returns their rows", () => {
    expect(validatePlayerProfileExportPage(page([row("1"), row("2", "8")]), "2026", 3, 2, 0, 2)).toHaveLength(2);
    expect(validatePlayerProfileExportPage(page([row("3")], 1), "2026", 3, 2, 1, 2)).toEqual([row("3")]);
  });

  it("rejects a changed cohort or empty non-final page", () => {
    expect(() => validatePlayerProfileExportPage(page([row("1"), row("2")], 0, 4), "2026", 3, 2, 0, 2)).toThrow(/changed/);
    expect(() => validatePlayerProfileExportPage(page([], 0), "2026", 3, 2, 0, 2)).toThrow(/incomplete/);
  });

  it("rejects duplicate identities within a page and across pages", () => {
    expect(() => validatePlayerProfileExportPage(page([row("1"), row("1")]), "2026", 3, 2, 0, 2)).toThrow(/duplicate/);
    expect(() => validateCompletePlayerProfileExport([row("1"), row("2"), row("1")], 3)).toThrow(/duplicate/);
  });

  it("rejects a final file whose row count does not match the cohort", () => {
    expect(() => validateCompletePlayerProfileExport([row("1"), row("2")], 3)).toThrow(/incomplete/);
    expect(validateCompletePlayerProfileExport([row("1"), row("2"), row("3")], 3)).toHaveLength(3);
  });
});
