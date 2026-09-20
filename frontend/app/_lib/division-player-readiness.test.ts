import { describe, expect, it } from "vitest";
import { assessDivisionPlayerAsset, divisionPlayerReadiness } from "./division-player-readiness";

const validAsset = {
  asset: "player_season_stats_2026.parquet",
  dataset: "player_season",
  rows: 100,
  division_fields: ["division"],
  identity_fields: ["athlete_id", "athlete_display_name", "team_id", "team_display_name"],
  receipt: { valid: true, sha256: "a".repeat(64), url: "https://archive.test/player.parquet" },
};

describe("division player readiness", () => {
  it("accepts an explicitly scoped player asset with complete identities and receipt", () => {
    expect(assessDivisionPlayerAsset(validAsset)).toMatchObject({ asset: validAsset.asset, rows: 100, status: "ready", reasons: [] });
    expect(divisionPlayerReadiness([validAsset, { ...validAsset, asset: "players.csv" }])).toMatchObject({ candidates: 2, ready: 2, blocked: 0, status: "ready" });
  });

  it("blocks a women’s player release that has no explicit division field", () => {
    const gate = assessDivisionPlayerAsset({
      ...validAsset,
      division_fields: [],
      identity_fields: ["athlete_id", "team_id"],
    });
    expect(gate?.status).toBe("blocked");
    expect(gate?.reasons).toEqual([
      "explicit division field is missing",
      "stable identity fields missing: team_display_name, athlete_display_name",
    ]);
  });

  it("does not treat schedule, team, or shot assets as player evidence", () => {
    expect(divisionPlayerReadiness([
      { asset: "wbb_schedule_2027.parquet", dataset: "schedule", rows: 100 },
      { asset: "team_box_2026.parquet", dataset: "team_box", rows: 100 },
      { asset: "ncaa_wbb_shots_2026.parquet", dataset: "shots", rows: 100 },
    ])).toMatchObject({ candidates: 0, ready: 0, blocked: 0, status: "blocked", gates: [] });
  });
});
