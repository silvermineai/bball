import { describe, expect, it } from "vitest";
import { boutiqueInitialDirection } from "./boutique-controls";

describe("boutique default ordering", () => {
  it("keeps publisher rank ascending and player values descending", () => {
    expect(boutiqueInitialDirection("ratings", "rank", null)).toBe("asc");
    expect(boutiqueInitialDirection("players", "box_bpm", null)).toBe("desc");
  });

  it("preserves an explicit shared-link direction", () => {
    expect(boutiqueInitialDirection("players", "box_bpm", "asc")).toBe("asc");
    expect(boutiqueInitialDirection("ratings", "rank", "desc")).toBe("desc");
    expect(boutiqueInitialDirection("ratings", "rank", "invalid")).toBe("asc");
  });
});
