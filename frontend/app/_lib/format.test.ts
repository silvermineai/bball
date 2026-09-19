import { describe, expect, it } from "vitest";
import { fmt, signed } from "./format";

describe("numeric display formatting", () => {
  it("keeps missing and non-finite values unavailable", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt(Number.NaN)).toBe("—");
    expect(fmt(Number.POSITIVE_INFINITY)).toBe("—");
    expect(signed(Number.NaN)).toBe("—");
    expect(signed(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("preserves valid localized and signed values", () => {
    expect(fmt(1234.5, 1)).toBe("1,234.5");
    expect(signed(2.5)).toBe("+2.5");
    expect(signed(-2.5)).toBe("-2.5");
  });
});
