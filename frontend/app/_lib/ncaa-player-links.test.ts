import { describe, expect, it } from "vitest";
import { ncaaPlayerHref, ncaaPlayerShotHref } from "./ncaa-player-links";

describe("NCAA player links", () => {
  it("keeps the exact player and season in the player-card URL", () => {
    expect(ncaaPlayerHref(123456, 2026)).toBe("/basketball/ncaa-player/?id=123456&season=2026");
  });

  it("supports a direct handoff to the coordinate-derived shot profile", () => {
    expect(ncaaPlayerShotHref("player 42", 2026)).toBe("/basketball/ncaa-player/?id=player+42&season=2026#shot-profile");
  });
});
