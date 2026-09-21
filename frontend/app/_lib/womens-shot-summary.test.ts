import { describe, expect, it } from "vitest";
import { womensShotTendencyStats } from "./womens-shot-summary";

describe("women's shot tendency summaries", () => {
  it("uses located attempts for shares and recorded attempts for shooting rates", () => {
    const rows = womensShotTendencyStats([
      { label: "Rim", attempts: 40, makes: 28 },
      { label: "3-point", attempts: 60, makes: 21 },
    ], 100);

    expect(rows[0]).toMatchObject({ share: 0.4, makeRate: 0.7 });
    expect(rows[1]).toMatchObject({ share: 0.6, makeRate: 0.35 });
  });

  it("fails closed on impossible make counts and unavailable denominators", () => {
    expect(womensShotTendencyStats([
      { label: "Rim", attempts: 4, makes: 5 },
    ], 0)[0]).toMatchObject({ makes: 0, share: 0, makeRate: null });
  });
});
