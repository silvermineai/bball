import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  recruitingRows,
  publicationDate,
  type RecruitingRelease,
} from "./recruiting";
const data = JSON.parse(
  readFileSync("public/data/basketball/recruiting.json", "utf8"),
) as RecruitingRelease;
describe("school announcement histories", () => {
  it("shows a later availability report and preserves the signing", () => {
    const row = recruitingRows(data).find(
      (p) => p.name === "Brandon McCoy Jr.",
    )!;
    expect(row.latest.kind).toBe("season_unavailable");
    expect(row.timeline.map((e) => e.kind)).toContain("addition");
  });
  it("prioritizes a same-day planned redshirt over the addition", () => {
    const row = recruitingRows(data).find((p) => p.name === "Lincoln Cosby")!;
    expect(row.latest.kind).toBe("redshirt_announced");
    expect(row.timeline).toHaveLength(2);
  });
  it("preserves a publication calendar date in every local timezone", () => {
    expect(publicationDate("2026-04-28")).toBe("Apr 28, 2026");
  });
});
