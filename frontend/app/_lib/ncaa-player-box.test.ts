import { describe, expect, it } from "vitest";
import { safeRate, trueShooting } from "./ncaa-player-box";

describe("NCAA player box rate helpers", () => {
  it("keeps missing source fields unavailable while preserving recorded zero makes", () => {
    expect(safeRate(0, 10)).toBe(0);
    expect(safeRate(null, 10)).toBeNull();
    expect(safeRate(4, null)).toBeNull();
    expect(safeRate(4, 0)).toBeNull();
  });

  it("requires both TS denominators before computing the disclosed fallback", () => {
    expect(trueShooting({ pts: 20, fga: 10, fta: 4 })).toBeCloseTo(20 / (2 * (10 + 0.475 * 4)));
    expect(trueShooting({ pts: 20, fga: null, fta: 4 })).toBeNull();
    expect(trueShooting({ pts: 20, fga: 10, fta: undefined })).toBeNull();
    expect(trueShooting({ pts: 0, fga: 10, fta: 0 })).toBe(0);
  });
});
