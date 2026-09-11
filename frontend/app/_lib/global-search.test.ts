import { describe, expect, it } from "vitest";
import { combineSearchResults, searchPrograms, searchRecruitingPeople, searchRosterPeople } from "./global-search";

describe("global basketball search", () => {
  it("prioritizes program names that start with the query", () => {
    const rows = searchPrograms(
      [{ id: "1", name: "North Carolina" }, { id: "2", name: "East Carolina" }, { id: "3", name: "Northwestern" }],
      "north",
    );
    expect(rows.map((row) => row.name)).toEqual(["North Carolina", "Northwestern"]);
    expect(rows[0].href).toBe("/basketball/programs/1/");
  });

  it("returns no local rows for a blank query and removes duplicate routes", () => {
    expect(searchPrograms([{ id: "1", name: "Duke" }], "   ")).toEqual([]);
    const player = { id: "p1", name: "Player", type: "player" as const, href: "/basketball/player/?id=p1" };
    const program = { id: "t1", name: "Program", type: "program" as const, href: "/basketball/programs/t1/" };
    expect(combineSearchResults([player, player], [program, program], 3)).toHaveLength(2);
  });

  it("keeps an exact program match visible above broad player matches", () => {
    const player = { id: "p1", name: "Duke Johnson", type: "player" as const, sport: "basketball" as const, href: "/basketball/player/?id=p1" };
    const program = { id: "t1", name: "Duke", type: "program" as const, sport: "basketball" as const, href: "/basketball/programs/t1/" };
    expect(combineSearchResults([player], [program], 2, "duke").map((row) => row.name)).toEqual(["Duke", "Duke Johnson"]);
  });

  it("routes announced recruiting names back to dated evidence", () => {
    const rows = searchRecruitingPeople([
      { key: "b", name: "Jordan Smith", category: "transfer" },
      { key: "a", name: "Smithson, Alex", category: "freshman" },
    ], "smith");
    expect(rows.map((row) => row.name)).toEqual(["Smithson, Alex", "Jordan Smith"]);
    expect(rows[0]).toMatchObject({ type: "player", sport: "basketball", detail: "Recruiting evidence · freshman" });
    expect(rows[0].href).toBe("/basketball/recruiting/?q=Smithson%2C%20Alex");
  });

  it("routes source-listed roster names to the observation view", () => {
    const rows = searchRosterPeople([
      { id: "2", name: "Jordan Smith", team: "Duke", status: "same_program" },
      { id: "1", name: "Smithson, Alex", team: "Kentucky", status: "new_to_dataset" },
    ], "smith");
    expect(rows.map((row) => row.name)).toEqual(["Smithson, Alex", "Jordan Smith"]);
    expect(rows[0]).toMatchObject({ type: "player", sport: "basketball", detail: "Roster observation · Kentucky · new to dataset" });
    expect(rows[0].href).toBe("/basketball/recruiting/?view=observations&rosterQ=Smithson%2C%20Alex");
  });
});
