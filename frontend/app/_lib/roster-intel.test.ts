import { describe, expect, it } from "vitest";
import { buildRosterIntel } from "./roster-intel";
import type { BBRoster } from "./basketball-types";
import type { ScoutProfile } from "./scouting-types";

const player = (id: string, name: string, minutes: number) =>
  ({ id, name, minutes }) as ScoutProfile["players"][number];

const roster = (id: string, name: string, status: string): BBRoster => ({
  id,
  name,
  team_id: "150",
  team: "Duke",
  previous_teams: [],
  status,
  position: "G",
  class_year: null,
  height: null,
  weight: null,
  source_url: null,
});

describe("roster intelligence", () => {
  it("joins source-listed movement to prior workload without inventing departures", () => {
    const profile = {
      id: "150",
      name: "Duke",
      players: [
        player("1", "Returning guard", 900),
        player("2", "Transfer forward", 500),
      ],
    } as ScoutProfile;
    const result = buildRosterIntel(
      [
        roster("1", "Returning guard", "same_program"),
        roster("2", "Transfer forward", "different_program"),
        roster("3", "New guard", "new_to_dataset"),
      ],
      profile,
    );
    expect(result.observed).toBe(3);
    expect(result.returning).toBe(1);
    expect(result.transfers).toBe(1);
    expect(result.newToDataset).toBe(1);
    expect(result.movement.map((row) => row.id)).toEqual(["2", "3"]);
    expect(result.players[0].priorPlayer?.minutes).toBe(900);
  });
});
