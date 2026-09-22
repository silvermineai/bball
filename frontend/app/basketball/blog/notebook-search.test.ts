import { describe, expect, it } from "vitest";
import { notebookSearchParams, readNotebookSearch } from "./notebook-index";

describe("shareable notebook finder search", () => {
  it("round-trips a team or matchup query", () => {
    const params = notebookSearchParams("  St. John's at Duke  ");
    expect(params.toString()).toBe("notebookQ=St.+John%27s+at+Duke");
    expect(readNotebookSearch(params)).toBe("St. John's at Duke");
  });

  it("bounds long queries and omits an empty search", () => {
    expect(readNotebookSearch(new URLSearchParams(`notebookQ=${"x".repeat(140)}`))).toBe("x".repeat(120));
    expect(notebookSearchParams("   ").toString()).toBe("");
  });
});
