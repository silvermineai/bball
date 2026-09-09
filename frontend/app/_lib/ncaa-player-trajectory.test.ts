import { describe, expect, it } from "vitest";
import { buildNcaaPlayerTrajectory } from "./ncaa-player-trajectory";

describe("NCAA player trajectory", () => {
  it("aggregates exact source team rows and orders newest season first", () => {
    const rows = buildNcaaPlayerTrajectory([
      {
        season: 2024,
        team_id: "a",
        stats: { games: 10, mins: 200, pts: 100, fgm: 40, fga: 80, tpm: 10, fta: 20 },
      },
      {
        season: 2024,
        team_id: "b",
        stats: { games: 5, mins: 100, pts: 50, fgm: 20, fga: 40, tpm: 5, fta: 10 },
      },
      {
        season: 2025,
        team_id: "b",
        stats: { games: 20, mins: 600, pts: 360, fgm: 120, fga: 240, tpm: 40, fta: 80 },
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ season: 2025, teams: 1, games: 20, points: 360, ppg: 18, mpg: 30 });
    expect(rows[1]).toMatchObject({ season: 2024, teams: 2, games: 15, minutes: 300, points: 150, ppg: 10, mpg: 20 });
  });

  it("keeps efficiency unavailable when a required source field is missing", () => {
    const [row] = buildNcaaPlayerTrajectory([
      {
        season: 2026,
        team_id: "a",
        stats: { games: 12, mins: 300, pts: 180, fgm: 60, fga: null, tpm: 20, fta: 50 },
      },
    ]);
    expect(row.ppg).toBe(15);
    expect(row.mpg).toBe(25);
    expect(row.ts).toBeNull();
    expect(row.efg).toBeNull();
  });

  it("does not let a missing games field create a rate denominator", () => {
    const [row] = buildNcaaPlayerTrajectory([
      { season: 2026, team_id: "a", stats: { games: null, mins: 100, pts: 40 } },
    ]);
    expect(row.games).toBe(0);
    expect(row.ppg).toBeNull();
    expect(row.mpg).toBeNull();
  });
});
