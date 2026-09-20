import { describe, expect, it } from "vitest";
import { prospectPeerContext, type ProspectPeerContextPayload } from "./peer-context";

const payload = (overrides: Partial<ProspectPeerContextPayload> = {}): ProspectPeerContextPayload => ({
  season: 2027,
  athlete_id: "260236",
  edition: "recruiting-2027-a",
  position: "SF",
  target_height_inches: 79,
  target_weight_pounds: 205,
  peers: 84,
  position_ranked: 61,
  height_recorded: 72,
  height_below: 50,
  height_equal: 8,
  average_height_inches: 77.4,
  weight_recorded: 70,
  weight_below: 43,
  weight_equal: 5,
  average_weight_pounds: 196.2,
  ...overrides,
});

const expected = { season: "2027", athleteId: "260236", edition: "recruiting-2027-a", position: "SF" };

describe("prospectPeerContext", () => {
  it("builds same-position context from raw exact-edition counts", () => {
    const result = prospectPeerContext(payload(), expected);
    expect(result).toEqual(expect.objectContaining({ position: "SF", peers: 84, positionRanked: 61 }));
    expect(result?.height).toEqual(expect.objectContaining({ value: 79, recorded: 72, below: 50, equal: 8, percentile: 75 }));
    expect(result?.weight?.percentile).toBeCloseTo(65);
  });

  it("withholds context when identity or edition does not match", () => {
    expect(prospectPeerContext(payload({ athlete_id: "999" }), expected)).toBeNull();
    expect(prospectPeerContext(payload({ edition: "recruiting-2027-b" }), expected)).toBeNull();
    expect(prospectPeerContext(payload({ position: "PF" }), expected)).toBeNull();
  });

  it("withholds malformed distributions without discarding valid peer counts", () => {
    const result = prospectPeerContext(payload({ height_equal: 0, weight_below: 80 }), expected);
    expect(result).toEqual(expect.objectContaining({ peers: 84, height: null, weight: null }));
  });

  it("rejects impossible cohort counts", () => {
    expect(prospectPeerContext(payload({ position_ranked: 85 }), expected)).toBeNull();
  });
});
