import { describe, expect, it } from "vitest";
import {
  buildPlayerCourtZones,
  classifyPlayerShotLocation,
  isMadePlayerShot,
  isMissedPlayerShot,
  isPlottablePlayerShot,
  matchesPlayerShotOutcome,
  playerShotBand,
  playerShotSide,
  summarizePlayerShotBands,
  summarizePlayerShotProfile,
  summarizePlayerShotSides,
  toPlayerCourtPoint,
  playerShotCoordinateExportRows,
  type PlayerShotLocation,
} from "./player-shot-locations";

const shot = (values: Partial<PlayerShotLocation>): PlayerShotLocation => ({
  id: "1",
  game: "game-1",
  player: "player-1",
  period: 1,
  clock: "10:00",
  points: 2,
  made: false,
  type: "jumper",
  x: 25,
  y: 15,
  location_status: "located",
  text: "",
  ...values,
});

describe("player shot location helpers", () => {
  it("exports every retained coordinate with exact team and contest provenance", () => {
    expect(playerShotCoordinateExportRows([{
      season: 2026,
      team_id: "team-1",
      team_name: "Example",
      stats: {
        coordinates: [
          ["contest-1", 1, 2, 12, "rim", "layup", true, 2],
          { contest_id: "contest-2", x: null, y: null, made: null, zone: "unknown" },
        ],
      },
    }], { player_id: "player-1", player_name: "Example Player" })).toEqual([
      { player_id: "player-1", player_name: "Example Player", season: 2026, team_id: "team-1", team_name: "Example", coordinate_index: 0, contest_id: "contest-1", x: 1, y: 2, distance_ft: 12, zone: "rim", type: "layup", made: true, points: 2, raw_coordinate: '["contest-1",1,2,12,"rim","layup",true,2]' },
      { player_id: "player-1", player_name: "Example Player", season: 2026, team_id: "team-1", team_name: "Example", coordinate_index: 1, contest_id: "contest-2", x: null, y: null, distance_ft: null, zone: "unknown", type: null, made: null, points: null, raw_coordinate: '{"contest_id":"contest-2","x":null,"y":null,"made":null,"zone":"unknown"}' },
    ]);
  });

  it("filters event markers without treating unknown outcomes as misses", () => {
    expect(matchesPlayerShotOutcome(shot({ made: true }), "all")).toBe(true);
    expect(matchesPlayerShotOutcome(shot({ made: 1 }), "made")).toBe(true);
    expect(matchesPlayerShotOutcome(shot({ made: false }), "missed")).toBe(true);
    expect(matchesPlayerShotOutcome(shot({ made: 0 }), "missed")).toBe(true);
    expect(matchesPlayerShotOutcome(shot({ made: null }), "missed")).toBe(false);
    expect(matchesPlayerShotOutcome(shot({ made: null }), "made")).toBe(false);
  });

  it("keeps unknown outcomes out of makes and shooting rates", () => {
    expect(isMadePlayerShot(shot({ made: null }))).toBe(false);
    expect(isMissedPlayerShot(shot({ made: null }))).toBe(false);
    const zones = buildPlayerCourtZones([
      shot({ x: 0, y: 1, made: true }),
      shot({ x: 0, y: 1, made: null }),
      shot({ x: 0, y: 1, made: false }),
    ]);
    const rim = zones.find((zone) => zone.attempts === 3);
    expect(rim?.makes).toBe(1);
    expect(rim?.knownOutcomes).toBe(2);
    expect(rim?.makeRate).toBeCloseTo(1 / 2);
  });

  it("keeps source coordinates in the same SVG projection as the NCAA chart", () => {
    expect(toPlayerCourtPoint(shot({ x: 0, y: 0 }))).toEqual({ x: 250, y: 52.5 });
    expect(toPlayerCourtPoint(shot({ x: -25, y: 41.75 }))).toEqual({ x: 0, y: 470 });
  });

  it("does not plot missing, contradictory, or full-court coordinates", () => {
    expect(isPlottablePlayerShot(shot({ x: null, y: null, location_status: "missing" }))).toBe(false);
    expect(isPlottablePlayerShot(shot({ location_status: "inconsistent" }))).toBe(false);
    expect(isPlottablePlayerShot(shot({ x: 0, y: 0 }))).toBe(false);
    expect(isPlottablePlayerShot(shot({ x: 25, y: 0 }))).toBe(false);
    expect(classifyPlayerShotLocation(shot({ y: 60 }))).toBe("beyond_half_court");
    expect(classifyPlayerShotLocation(shot({ x: 80 }))).toBe("missing");
  });

  it("builds a conservative density grid and retains made counts", () => {
    const zones = buildPlayerCourtZones([
      shot({ x: 0, y: 1, made: true }),
      shot({ x: 0, y: 1, made: false }),
      shot({ x: -25, y: 41.75, made: true }),
      shot({ x: 25, y: 0, made: true }),
      shot({ x: null, y: null, location_status: "missing" }),
    ]);
    expect(zones).toHaveLength(90);
    expect(zones.reduce((sum, zone) => sum + zone.attempts, 0)).toBe(3);
    expect(zones.reduce((sum, zone) => sum + zone.makes, 0)).toBe(2);
    expect(zones.reduce((sum, zone) => sum + zone.share, 0)).toBeCloseTo(1);
  });

  it("summarizes geometric bands without treating missing locations as misses", () => {
    const bands = summarizePlayerShotBands([
      shot({ x: 0, y: 1, made: true }),
      shot({ x: 0, y: 10, made: false }),
      shot({ x: 0, y: 30, made: true }),
      shot({ x: null, y: null, made: false, location_status: "missing" }),
    ]);
    expect(playerShotBand(shot({ x: 0, y: 1 }))).toBe("Rim");
    expect(playerShotBand(shot({ x: 0, y: 30 }))).toBe("3-point");
    expect(bands.reduce((sum, band) => sum + band.attempts, 0)).toBe(3);
    expect(bands.find((band) => band.band === "Rim")?.makeRate).toBe(1);
  });

  it("quantifies chart-side tendency at the painted-lane edges", () => {
    const sides = summarizePlayerShotSides([
      shot({ x: -9, y: 15, made: true }),
      shot({ x: -8, y: 15, made: false }),
      shot({ x: 0, y: 15, made: true }),
      shot({ x: 8, y: 15, made: false }),
      shot({ x: 9, y: 15, made: true }),
      shot({ x: 12, y: 60, made: true }),
      shot({ x: null, y: null, made: true, location_status: "missing" }),
    ]);

    expect(playerShotSide(shot({ x: -8 }))).toBe("Middle");
    expect(playerShotSide(shot({ x: 8 }))).toBe("Middle");
    expect(playerShotSide(shot({ x: null }))).toBeNull();
    expect(sides).toEqual([
      { side: "Chart left", attempts: 1, knownOutcomes: 1, makes: 1, share: 0.2, makeRate: 1 },
      { side: "Middle", attempts: 3, knownOutcomes: 3, makes: 1, share: 0.6, makeRate: 1 / 3 },
      { side: "Chart right", attempts: 1, knownOutcomes: 1, makes: 1, share: 0.2, makeRate: 1 },
    ]);
  });

  it("turns the map into a denominator-aware quick read", () => {
    const summary = summarizePlayerShotProfile([
      shot({ x: 0, y: 1, made: true }),
      shot({ x: 1, y: 2, made: false }),
      shot({ x: -10, y: 30, made: true }),
      shot({ x: null, y: null, made: false, location_status: "missing" }),
      shot({ x: 0, y: 60, made: true }),
    ], 6);

    expect(summary.totalAttempts).toBe(6);
    expect(summary.plottedAttempts).toBe(3);
    expect(summary.plottedShare).toBeCloseTo(0.5);
    expect(summary.dominantBand?.band).toBe("Rim");
    expect(summary.dominantBand?.attempts).toBe(2);
    expect(summary.dominantSide?.side).toBe("Middle");
    expect(summary.dominantSide?.attempts).toBe(2);
  });

  it("does not invent a dominant band or side when the plotted counts tie", () => {
    const summary = summarizePlayerShotProfile([
      shot({ x: -9, y: 1 }),
      shot({ x: 9, y: 1 }),
      shot({ x: -9, y: 15 }),
      shot({ x: 9, y: 15 }),
      shot({ x: 0, y: 30 }),
      shot({ x: 0, y: 32 }),
    ]);

    expect(summary.dominantBand).toBeNull();
    expect(summary.dominantSide).toBeNull();
  });
});
