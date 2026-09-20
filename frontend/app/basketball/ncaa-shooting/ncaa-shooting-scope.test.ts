import { describe, expect, it } from "vitest";
import { parseSportScope } from "../../_lib/sport-scope";
import {
  shootingArchiveAvailable,
  shootingArchiveScopeParams,
} from "./ncaa-shooting-scope";

describe("NCAA shooting archive scope", () => {
  it("only exposes the retained coordinate release for men’s D1", () => {
    expect(shootingArchiveAvailable(parseSportScope({ gender: "men", division: "1" }))).toBe(true);
    expect(shootingArchiveAvailable(parseSportScope({ gender: "women", division: "1" }))).toBe(false);
    expect(shootingArchiveAvailable(parseSportScope({ gender: "men", division: "2" }))).toBe(false);
  });

  it("preserves gender and division when shooting controls rewrite the URL", () => {
    const params = shootingArchiveScopeParams({ gender: "women", division: "3" });
    expect(params.toString()).toBe("gender=women&division=3");
  });
});
