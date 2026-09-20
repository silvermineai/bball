import { describe, expect, it } from "vitest";
import { basketballScopeAvailable, footballScopeAvailable, parseSportScope, parseSportScopeSearch, scopeLabel } from "./sport-scope";

describe("sport scope", () => {
  it("normalizes missing and invalid scope values to the published men’s D1 edition", () => {
    expect(parseSportScope()).toEqual({ gender: "men", division: "1" });
    expect(parseSportScope({ gender: "other", division: "9" })).toEqual({ gender: "men", division: "1" });
  });

  it("keeps supported scope explicit and fails closed for unsupported editions", () => {
    const d1 = parseSportScope({ gender: "men", division: "1" });
    const womenD3 = parseSportScope({ gender: "women", division: "3" });
    expect(scopeLabel(womenD3)).toBe("Women's · D3");
    expect(basketballScopeAvailable(d1)).toBe(true);
    expect(basketballScopeAvailable(womenD3)).toBe(false);
    expect(footballScopeAvailable(womenD3)).toBe(false);
  });

  it("updates scope when navigation changes only the query string", () => {
    expect(parseSportScopeSearch("?gender=women&division=2")).toEqual({ gender: "women", division: "2" });
    expect(parseSportScopeSearch("?gender=men&division=3")).toEqual({ gender: "men", division: "3" });
  });
});
