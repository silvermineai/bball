import { describe, expect, it } from "vitest";
import { playerProfileStatHref } from "./player-profile-links";

describe("player profile production handoff", () => {
  it("preserves the exact numeric archive ID and season", () => {
    expect(playerProfileStatHref("10007029", 2026)).toBe(
      "/basketball/ncaa-player/?id=10007029&season=2026#shot-profile",
    );
  });

  it("fails closed for non-archive IDs and unsupported seasons", () => {
    expect(playerProfileStatHref("source:player/42", 2026)).toBeNull();
    expect(playerProfileStatHref("10007029", 2027)).toBeNull();
    expect(playerProfileStatHref("10007029", 2002)).toBeNull();
  });
});
