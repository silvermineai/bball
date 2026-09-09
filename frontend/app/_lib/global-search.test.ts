import { describe, expect, it } from "vitest";
import { combineSearchResults, searchPrograms } from "./global-search";

describe("global basketball search", () => {
  it("prioritizes program names that start with the query", () => {
    const rows = searchPrograms(
      [{ id: "1", name: "North Carolina" }, { id: "2", name: "East Carolina" }, { id: "3", name: "Northwestern" }],
      "north",
    );
    expect(rows.map((row) => row.name)).toEqual(["North Carolina", "Northwestern"]);
    expect(rows[0].href).toBe("/basketball/programs/1/");
  });

  it("returns no local rows for a blank query and bounds the combined list", () => {
    expect(searchPrograms([{ id: "1", name: "Duke" }], "   ")).toEqual([]);
    const player = { id: "p1", name: "Player", type: "player" as const, href: "/basketball/player/?id=p1" };
    const program = { id: "t1", name: "Program", type: "program" as const, href: "/basketball/programs/t1/" };
    expect(combineSearchResults([player, player], [program, program], 3)).toHaveLength(3);
  });
});
