import { describe, expect, it } from "vitest";
import { publicArchiveText } from "./public-text";

describe("public archive text", () => {
  it("removes provider names and URLs from retained copy", () => {
    expect(publicArchiveText("ESPN and NCAA.com report https://example.com"))
      .toBe("the reporting desk and the national archive report archived media");
  });

  it("keeps ordinary statistical prose unchanged", () => {
    expect(publicArchiveText("Four Factors explain the matchup."))
      .toBe("Four Factors explain the matchup.");
  });
});
