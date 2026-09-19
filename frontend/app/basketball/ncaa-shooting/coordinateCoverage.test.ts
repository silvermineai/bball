import { describe, expect, it } from "vitest";
import { coordinateCoverage } from "./coordinateCoverage";

describe("NCAA shooting coordinate coverage", () => {
  it("reports validated locations against all recorded attempts", () => {
    expect(coordinateCoverage({ located_count: 198, attempts: 200 })).toBe("198 / 200");
  });

  it("does not treat an unlocated coordinate record as a plotted point", () => {
    expect(coordinateCoverage({ located_count: 1, attempts: 2 })).toBe("1 / 2");
    expect(coordinateCoverage({ attempts: 2 })).toBe("— / 2");
    expect(coordinateCoverage({ coordinate_count: 2, attempts: 2 })).toBe("— / 2");
  });

  it("withholds malformed counts instead of rendering fabricated coverage", () => {
    expect(coordinateCoverage({ located_count: -1, attempts: Number.NaN })).toBe("—");
  });
});
