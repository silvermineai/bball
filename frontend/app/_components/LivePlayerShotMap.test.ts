import { describe, expect, it } from "vitest";
import { eligibleShotMapLeaders, playerCardShotLocations, shotMapCoverageLabel } from "./LivePlayerShotMap";
import { recordedPlayerAttemptCount, unreturnedPlayerAttemptCount } from "../_lib/player-shot-locations";

describe("homepage player shot map", () => {
  it("keeps the source attempt denominator when coordinate rows are compacted", () => {
    expect(recordedPlayerAttemptCount(200, 198)).toBe(200);
    expect(unreturnedPlayerAttemptCount(200, 198)).toBe(2);
    expect(recordedPlayerAttemptCount(null, 198)).toBe(198);
    // A response must not hide returned evidence if its aggregate is invalid.
    expect(recordedPlayerAttemptCount(3, 5)).toBe(5);
    expect(unreturnedPlayerAttemptCount(3, 5)).toBe(0);
  });

  it("shows coordinate coverage against every retained attempt", () => {
    expect(shotMapCoverageLabel({ attempts: 200, located_count: 198 })).toBe("198 / 200 located coordinates (99.0%)");
    expect(shotMapCoverageLabel({ attempts: 2 })).toBe("— / 2 located coordinates");
    expect(shotMapCoverageLabel({ attempts: 0, located_count: 0 })).toBe("0 / 0 located coordinates");
  });

  it("withholds malformed coverage instead of reporting a complete map", () => {
    expect(shotMapCoverageLabel({ attempts: 4, located_count: 5 })).toBe("Location coverage invalid");
    expect(shotMapCoverageLabel({ attempts: Number.NaN, located_count: 1 })).toBe("Location coverage unavailable");
  });

  it("keeps only exact numeric player identities that have recorded coordinates", () => {
    const rows = [
      { player_id: "42", team_id: "100", player_name: "Mapped Player", team_name: "Example", value: 200, stats: { attempts: 200, coordinate_count: 198, located_count: 198 } },
      { player_id: "source:name", team_id: "source:team", player_name: "Label Only", team_name: "Example", value: 220, stats: { attempts: 220, coordinate_count: 220 } },
      { player_id: "43", team_id: "100", player_name: "Placeholder Only", team_name: "Example", value: 180, stats: { attempts: 180, coordinate_count: 180, located_count: 0 } },
      { player_id: "44", team_id: "100", player_name: "No Coordinates", team_name: "Example", value: 170, stats: { attempts: 170, coordinate_count: 0, located_count: 0 } },
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

  it("keeps a selected program map from pooling another team stint", () => {
    const card = {
      shooting: [
        { season: 2026, team_id: "100", stats: { coordinates: [["game-1", -4, 8, 9, "rim", "layup", true, 2] as [string, number, number, number, string, string, boolean, number]] } },
        { season: 2026, team_id: "200", stats: { coordinates: [["game-2", 20, 24, 31, "abovebreak3", "three", false, 3] as [string, number, number, number, string, string, boolean, number]] } },
      ],
    };
    const shots = playerCardShotLocations(card, 2026, "42", "100");
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ id: "100-game-1-0", game: "game-1", x: -4, y: 8 });
  });
});
