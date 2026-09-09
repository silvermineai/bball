import { describe, expect, it } from "vitest";
import { buildRecruitingFit, buildRoleSummaries, positionRole } from "./recruiting-fit";
import type { BBRoster } from "./basketball-types";

const player = (patch: Partial<BBRoster>): BBRoster => ({
  id: patch.id || Math.random().toString(), name: patch.name || "Player", team_id: patch.team_id || "1", team: patch.team || "Team", previous_teams: [], status: "different_program", position: "G", class_year: "Junior", height: null, weight: null, source_url: null, prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 14, rpg: 4, apg: 5, spg: 1, bpg: 0.2, efg: 0.5, ts: 0.55, teams: ["Team"] }, ...patch,
});

describe("recruiting fit", () => {
  it("normalizes source positions into coach roles", () => {
    expect(positionRole("PG")).toBe("guard");
    expect(positionRole("SF")).toBe("wing");
    expect(positionRole("C")).toBe("big");
    expect(positionRole(null)).toBe("unknown");
  });

  it("keeps the target roster out of the candidate board and ranks qualified candidates", () => {
    const rows = [
      player({ id: "target", team_id: "target", status: "same_program", name: "Target" }),
      player({ id: "a", team_id: "2", name: "Creator A", prior_production: { games: 30, minutes: 900, mpg: 30, ppg: 18, rpg: 4, apg: 8, spg: 1, bpg: 0, efg: 0.56, ts: 0.61, teams: ["A"] } }),
      player({ id: "b", team_id: "3", name: "Creator B", prior_production: { games: 30, minutes: 500, mpg: 17, ppg: 10, rpg: 3, apg: 2, spg: 0.5, bpg: 0, efg: 0.48, ts: 0.51, teams: ["B"] } }),
    ];
    const result = buildRecruitingFit(rows, { teamId: "target", role: "guard", focus: "creation", minimumMinutes: 400 });
    expect(result.map((row) => row.player.id)).toEqual(["a", "b"]);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("summarizes returning and incoming workload by role", () => {
    const result = buildRoleSummaries([
      player({ team_id: "target", position: "C", status: "same_program", prior_production: { games: 20, minutes: 600, mpg: 30, ppg: 10, rpg: 8, apg: 2, teams: ["T"] } }),
      player({ team_id: "target", position: "C", status: "different_program", prior_production: { games: 20, minutes: 300, mpg: 15, ppg: 6, rpg: 4, apg: 1, teams: ["X"] } }),
    ], "target");
    expect(result.find((row) => row.role === "big")).toMatchObject({ listed: 2, priorMinutes: 900, returningMinutes: 600, incomingMinutes: 300, returningShare: 2 / 3, incomingShare: 1 / 3 });
  });
});
