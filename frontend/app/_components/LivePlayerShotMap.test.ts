import { describe, expect, it } from "vitest";
import { eligibleShotMapLeaders, playerCardShotLocations } from "./LivePlayerShotMap";

describe("homepage player shot map", () => {
  it("keeps only exact numeric player identities that have recorded coordinates", () => {
    const rows = [
      { player_id: "42", player_name: "Mapped Player", team_name: "Example", value: 200, stats: { attempts: 200, coordinate_count: 198, located_count: 198 } },
      { player_id: "source:name", player_name: "Label Only", team_name: "Example", value: 220, stats: { attempts: 220, coordinate_count: 220 } },
      { player_id: "43", player_name: "Placeholder Only", team_name: "Example", value: 180, stats: { attempts: 180, coordinate_count: 180, located_count: 0 } },
      { player_id: "44", player_name: "No Coordinates", team_name: "Example", value: 170, stats: { attempts: 170, coordinate_count: 0, located_count: 0 } },
    ];
    expect(eligibleShotMapLeaders(rows)).toEqual([rows[0]]);
  });

  it("expands coordinate tuples without turning missing locations into plotted points", () => {
    const shots = playerCardShotLocations({
      shooting: [{
        season: 2026,
        team_id: "100",
        stats: {
          coordinates: [
            ["game-1", -4, 8, 9, "paint", "jump shot", true, 2],
            ["game-2", null, null, null, "unknown", null, false, 2],
          ],
        },
      }, {
        season: 2025,
        team_id: "100",
        stats: { coordinates: [["old", 1, 1, 1, "rim", "layup", true, 2]] },
      }],
    }, 2026, "42");

    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ game: "game-1", player: "42", x: -4, y: 8, made: true, points: 2, location_status: "located" });
    expect(shots[1]).toMatchObject({ game: "game-2", x: null, y: null, location_status: "missing" });
  });
});
