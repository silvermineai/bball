import { describe, expect, it } from "vitest";
import { footballPersonnelReadinessRows, personnelReadinessForGame, personnelReadinessStatusLabel } from "./football-personnel-readiness";
import type { FootballPersonnelReadinessGame } from "./football-personnel-readiness";

const side = (team_id: string, values: Partial<FootballPersonnelReadinessGame["home"]> = {}) => ({
  team_id,
  team: null,
  available_fields: Object.keys(values),
  source_datasets: ["team_talent"],
  conflicting_fields: [],
  talent_composite: null,
  talent_rank: null,
  blue_chip_ratio: null,
  off_returning: null,
  def_returning: null,
  overall_returning: null,
  ...values,
});

const row: FootballPersonnelReadinessGame = {
  game_id: "g1",
  kickoff: "2026-09-01T00:00:00Z",
  home_id: "10",
  away_id: "20",
  home_name: "Home",
  away_name: "Away",
  home_division: "fbs",
  away_division: "fbs",
  model_id: "model-1",
  status: "partial",
  home: side("10", { talent_rank: 20, off_returning: 0.4 }),
  away: side("20", { talent_rank: 10, off_returning: 0.4 }),
};

describe("football personnel readiness context", () => {
  it("joins only the exact game and team IDs", () => {
    expect(personnelReadinessForGame([row], { id: "g1", home_id: "10", away_id: "20" })).toBe(row);
    expect(personnelReadinessForGame([row], { id: "g1", home_id: "20", away_id: "10" })).toBeNull();
    expect(personnelReadinessForGame([row], { id: "other", home_id: "10", away_id: "20" })).toBeNull();
  });

  it("keeps missing values unavailable and handles lower-is-better ranks", () => {
    const ranks = footballPersonnelReadinessRows(row).find((item) => item.key === "talent_rank");
    const returning = footballPersonnelReadinessRows(row).find((item) => item.key === "off_returning");
    const composite = footballPersonnelReadinessRows(row).find((item) => item.key === "talent_composite");
    expect(ranks).toMatchObject({ away: 10, home: 20, edge: "away" });
    expect(returning).toMatchObject({ away: 0.4, home: 0.4, edge: "even" });
    expect(composite).toMatchObject({ away: null, home: null, edge: "unavailable" });
  });

  it("labels conflict and unavailable states without turning them into zeroes", () => {
    expect(personnelReadinessStatusLabel("conflict")).toBe("Conflicting source rows");
    expect(personnelReadinessStatusLabel("unavailable")).toBe("Context unavailable");
    expect(row.home.talent_composite).toBeNull();
  });
});
