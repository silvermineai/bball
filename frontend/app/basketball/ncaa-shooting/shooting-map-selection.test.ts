import { describe, expect, it } from "vitest";
import { readShootingMapSelection, writeShootingMapSelection } from "./shooting-map-selection";

describe("shooting map deep links", () => {
  it("reads a complete archive player and team identity", () => {
    expect(readShootingMapSelection(new URLSearchParams("mapPlayer=42&mapTeam=7"))).toEqual({ playerId: "42", teamId: "7" });
  });

  it("fails closed when either identity half is missing", () => {
    expect(readShootingMapSelection(new URLSearchParams("mapPlayer=42"))).toBeNull();
    expect(readShootingMapSelection(new URLSearchParams("mapTeam=7"))).toBeNull();
  });

  it("preserves filters while adding and removing a map selection", () => {
    const params = new URLSearchParams("season=2026&q=Jade%20Jones");
    writeShootingMapSelection(params, { playerId: "42", teamId: "7" });
    expect(params.toString()).toBe("season=2026&q=Jade+Jones&mapPlayer=42&mapTeam=7");
    writeShootingMapSelection(params, null);
    expect(params.toString()).toBe("season=2026&q=Jade+Jones");
  });
});
