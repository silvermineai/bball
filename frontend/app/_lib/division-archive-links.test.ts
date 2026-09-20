import { describe, expect, it } from "vitest";
import { lowerDivisionPlayerHref, lowerDivisionTeamHref } from "./division-archive-links";

describe("lower-division archive links", () => {
  it("keeps the exact player ID and requested division in the player dossier URL", () => {
    expect(lowerDivisionPlayerHref("2", 12345)).toBe("/basketball/ncaa/?division=2&player=12345");
    expect(lowerDivisionPlayerHref("3", "987654")).toBe("/basketball/ncaa/?division=3&player=987654");
  });

  it("keeps team IDs scoped to the lower-division team archive", () => {
    expect(lowerDivisionTeamHref("2", 77)).toBe("/basketball/ratings/?division=2&team=77");
    expect(lowerDivisionTeamHref("3", "88")).toBe("/basketball/ratings/?division=3&team=88");
  });

  it("rejects non-NCAA IDs instead of constructing an ambiguous fallback URL", () => {
    expect(() => lowerDivisionPlayerHref("2", "unknown")).toThrow("numeric NCAA IDs");
    expect(() => lowerDivisionTeamHref("3", "12/34")).toThrow("numeric NCAA IDs");
  });
});
