import { describe, expect, it } from "vitest";
import { marketArchiveFilterEmptyState, marketArchiveTimingLabel } from "./market-archive-view";

describe("market archive timing display", () => {
  it("distinguishes pregame rows from post-tip reference rows", () => {
    expect(marketArchiveTimingLabel(1)).toBe("Pregame capture");
    expect(marketArchiveTimingLabel(0)).toBe("Post-tip capture");
  });

  it("does not treat missing timing evidence as pregame", () => {
    expect(marketArchiveTimingLabel(null)).toBe("Timing unavailable");
    expect(marketArchiveTimingLabel(undefined)).toBe("Timing unavailable");
  });

  it("distinguishes an empty filtered cohort from an empty archive", () => {
    expect(marketArchiveFilterEmptyState("all", "all")).toBeNull();
    expect(marketArchiveFilterEmptyState("spreads", "all")).toEqual({
      heading: "No spreads observations match these filters.",
      detail: "Other retained market rows may exist outside the selected filters. This empty result does not establish that no line was available.",
    });
    expect(marketArchiveFilterEmptyState("h2h", "pregame")?.heading).toBe("No moneyline / pregame observations match these filters.");
  });
});
