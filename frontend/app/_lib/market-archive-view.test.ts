import { describe, expect, it } from "vitest";
import { marketArchiveTimingLabel } from "./market-archive-view";

describe("market archive timing display", () => {
  it("distinguishes pregame rows from post-tip reference rows", () => {
    expect(marketArchiveTimingLabel(1)).toBe("Pregame capture");
    expect(marketArchiveTimingLabel(0)).toBe("Post-tip capture");
  });

  it("does not treat missing timing evidence as pregame", () => {
    expect(marketArchiveTimingLabel(null)).toBe("Timing unavailable");
    expect(marketArchiveTimingLabel(undefined)).toBe("Timing unavailable");
  });
});
