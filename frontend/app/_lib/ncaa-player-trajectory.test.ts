import { describe, expect, it } from "vitest";
import { buildNcaaPlayerTrajectory, trajectoryContext } from "./ncaa-player-trajectory";

describe("NCAA player trajectory", () => {
  it("aggregates exact source team rows and orders newest season first", () => {
    const rows = buildNcaaPlayerTrajectory([
      {
        season: 2024,
        team_id: "a",
        games: 10,
        stats: { games: 10, mins: 200, pts: 100, o_poss: 180, ast: 30, tov: 18, fgm: 40, fga: 80, tpm: 10, tpa: 30, fta: 20 },
      },
      {
        season: 2024,
        team_id: "b",
        games: 5,
        stats: { games: 5, mins: 100, pts: 50, o_poss: 90, ast: 15, tov: 9, fgm: 20, fga: 40, tpm: 5, tpa: 15, fta: 10 },
      },
      {
        season: 2025,
        team_id: "b",
        games: 20,
        stats: { games: 20, mins: 600, pts: 360, o_poss: 600, ast: 90, tov: 60, fgm: 120, fga: 240, tpm: 40, tpa: 100, fta: 80 },
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ season: 2025, teams: 1, games: 20, points: 360, ppg: 18, mpg: 30 });
    expect(rows[1]).toMatchObject({ season: 2024, teams: 2, games: 15, minutes: 300, points: 150, ppg: 10, mpg: 20 });
    expect(rows[0].pointsPerPossession).toBe(0.6);
    expect(rows[0].assistsPerPossession).toBe(0.15);
    expect(rows[0].turnoversPerPossession).toBe(0.1);
    expect(rows[0].threePointAttemptRate).toBeCloseTo(100 / 240);
    expect(rows[0].freeThrowAttemptRate).toBeCloseTo(80 / 240);
  });

  it("keeps efficiency unavailable when a required source field is missing", () => {
    const [row] = buildNcaaPlayerTrajectory([
      {
        season: 2026,
        team_id: "a",
        games: 12,
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
      { season: 2026, team_id: "a", games: null, stats: { games: null, mins: 100, pts: 40 } },
    ]);
    expect(row.games).toBeNull();
    expect(row.ppg).toBeNull();
    expect(row.mpg).toBeNull();
  });

  it("fails closed when possession or shot-mix denominators are missing or invalid", () => {
    const [row] = buildNcaaPlayerTrajectory([
      {
        season: 2026,
        team_id: "a",
        games: 12,
        stats: { pts: 180, o_poss: null, ast: 60, tov: 20, fgm: 70, fga: 140, tpm: 25, tpa: 150, fta: 40 },
      },
    ]);
    expect(row.pointsPerPossession).toBeNull();
    expect(row.assistsPerPossession).toBeNull();
    expect(row.turnoversPerPossession).toBeNull();
    expect(row.threePointAttemptRate).toBeNull();
    expect(row.freeThrowAttemptRate).toBeCloseTo(40 / 140);
  });

  it("uses the selected season for the summary and compares it with the prior row", () => {
    const rows = buildNcaaPlayerTrajectory([
      { season: 2024, team_id: "a", games: 20, stats: { mins: 400, pts: 200 } },
      { season: 2025, team_id: "a", games: 20, stats: { mins: 500, pts: 300 } },
      { season: 2026, team_id: "a", games: 20, stats: { mins: 600, pts: 500 } },
    ]);
    const context = trajectoryContext(rows, 2025);
    expect(context.active?.season).toBe(2025);
    expect(context.prior?.season).toBe(2024);
    expect(context.ppgDelta).toBe(5);
  });
});
