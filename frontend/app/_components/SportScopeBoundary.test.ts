import { describe, expect, it } from "vitest";
import { isPublishedBoundary } from "./SportScopeBoundary";

describe("sport scope boundary", () => {
  it("keeps women’s basketball isolated on every route", () => {
    expect(isPublishedBoundary("basketball", { gender: "women", division: "1" }, "/basketball/players")).toBe(true);
  });

  it("allows published men’s NCAA D2/D3 archives", () => {
    expect(isPublishedBoundary("basketball", { gender: "men", division: "2" }, "/basketball/ncaa-rankings/")).toBe(false);
    expect(isPublishedBoundary("basketball", { gender: "men", division: "3" }, "/basketball/players/")).toBe(true);
  });

  it("fails closed for football D2/D3", () => {
    expect(isPublishedBoundary("football", { gender: "men", division: "2" }, "/football/players/")).toBe(true);
    expect(isPublishedBoundary("football", { gender: "men", division: "1" }, "/football/players/")).toBe(false);
  });
});
