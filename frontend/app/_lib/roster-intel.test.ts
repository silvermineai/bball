import { describe, expect, it } from "vitest";
import { buildRosterIntel, buildRosterSummary } from "./roster-intel";
import type { BBRoster } from "./basketball-types";
import type { ScoutProfile } from "./scouting-types";

const player = (id: string, name: string, minutes: number) =>
  ({ id, name, minutes }) as ScoutProfile["players"][number];

const roster = (id: string, name: string, status: string, minutes = 0): BBRoster => ({
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
  prior_production: minutes
    ? {
        games: 20,
        minutes,
        mpg: minutes / 20,
        ppg: 10,
        rpg: 5,
        apg: 2,
        teams: ["Duke"],
      }
    : null,
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
      buildRosterSummary([
        roster("1", "Returning guard", "same_program", 900),
        roster("2", "Transfer forward", "different_program", 500),
        roster("3", "New guard", "new_to_dataset"),
      ]),
      profile,
    );
    expect(result.observed).toBe(3);
    expect(result.returning).toBe(1);
    expect(result.transfers).toBe(1);
    expect(result.newToDataset).toBe(1);
    expect(result.movement.map((row) => row.id)).toEqual(["2", "3"]);
    expect(result.players[0].priorPlayer?.minutes).toBe(500);
    const summary = buildRosterSummary([
      roster("1", "Returning guard", "same_program", 900),
      roster("2", "Transfer forward", "different_program", 500),
      roster("3", "New guard", "new_to_dataset"),
    ])[0];
    expect(summary.priorMinutes).toBe(1400);
    expect(summary.returningMinutes).toBe(900);
    expect(summary.incomingPriorMinutes).toBe(500);
    expect(summary.returningMinutesShare).toBeCloseTo(900 / 1400);
    expect(summary.representedPriorMinutesShare).toBe(1);
  });
});
