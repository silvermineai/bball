import { describe, expect, it } from "vitest";
import { espnGameUrl } from "./basketball-data";

describe("basketball source links", () => {
  it("builds an encoded ESPN game URL from the source schedule id", () => {
    expect(espnGameUrl("401902275")).toBe(
      "https://www.espn.com/mens-college-basketball/game/_/gameId/401902275",
    );
    expect(espnGameUrl("a/b")).toContain("gameId/a%2Fb");
  });
});
