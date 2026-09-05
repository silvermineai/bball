import { describe, it, expect } from "vitest";
import { summarizeShots, onHalfCourt, type Shot } from "./shooting";
const shot = (values: Partial<Shot>) =>
  ({
    id: "long-id",
    game: "1",
    team: "150",
    player: "7",
    period: 1,
    clock: "1:00",
    points: 2,
    made: false,
    type: "jumper",
    x: 25,
    y: 15,
    location_status: "located",
    text: "",
    team_match: true,
    player_match: true,
    inferred_value: false,
    ...values,
  }) as Shot;
describe("shot summaries", () => {
  it("keeps missing locations in shooting percentages", () => {
    const s = summarizeShots([
      shot({ made: true, points: 3 }),
      shot({ x: null, y: null, location_status: "placeholder" }),
    ]);
    expect(s.fg).toBe(0.5);
    expect(s.efg).toBe(0.75);
    expect(s.plotted).toBe(1);
  });
  it("excludes long heaves from the half-court drawing without dropping attempts", () => {
    const s = shot({ y: 60, points: 3 });
    expect(onHalfCourt(s)).toBe(false);
    expect(summarizeShots([s]).attempts).toBe(1);
  });
  it("does not turn an empty sample into zero shooting accuracy", () => {
    expect(summarizeShots([]).fg).toBeNull();
    expect(summarizeShots([]).efg).toBeNull();
  });
});
