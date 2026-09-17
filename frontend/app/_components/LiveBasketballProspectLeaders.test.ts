import { describe, expect, it } from "vitest";
import { formatProspectSize } from "./LiveBasketballProspectLeaders";

describe("prospect size formatting", () => {
  it("renders the recorded height and weight together", () => {
    expect(formatProspectSize({ athlete_id: "1", name: "Guard", height_inches: 75, weight_pounds: 185 })).toBe("6'3\" · 185 lb");
  });

  it("keeps missing measurements unavailable", () => {
    expect(formatProspectSize({ athlete_id: "2", name: "Forward" })).toBe("—");
  });
});
