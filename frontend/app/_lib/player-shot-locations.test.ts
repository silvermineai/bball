import { describe, expect, it } from "vitest";
import {
  buildPlayerCourtZones,
  classifyPlayerShotLocation,
  isPlottablePlayerShot,
  playerShotBand,
  playerShotSide,
  summarizePlayerShotBands,
  summarizePlayerShotSides,
  toPlayerCourtPoint,
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
      { side: "Chart left", attempts: 1, makes: 1, share: 0.2, makeRate: 1 },
      { side: "Middle", attempts: 3, makes: 1, share: 0.6, makeRate: 1 / 3 },
      { side: "Chart right", attempts: 1, makes: 1, share: 0.2, makeRate: 1 },
    ]);
  });
});
