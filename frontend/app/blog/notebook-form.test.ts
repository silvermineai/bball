import { describe, expect, it } from "vitest";
import type { ScoutProfile, Split } from "../_lib/scouting-types";
import { notebookRecentForm } from "./notebook-form";

const split = (games: number, value: number | null): Split => ({
  games,
  scored_games: games,
  paired_games: games,
  wins: games ? games - 1 : 0,
  losses: games ? 1 : 0,
  ties: 0,
  pace: games ? 70 : null,
  close_games: 0,
  close_wins: 0,
  sos: null,
  sos_games: 0,
  metrics: Object.fromEntries(["off_eff", "def_eff", "off_efg", "off_tov", "off_orb", "off_ftr"].map((key) => [key, { value, games }])),
});

const profile = (id: string, patch: Partial<ScoutProfile> = {}): ScoutProfile => ({
  id,
  name: `Team ${id}`,
  season: 2026,
  forecast_season: 2027,
  generated_at: "2026-09-19T00:00:00Z",
  source_edition: "edition-a",
  model_id: "model-a",
  rating: {} as ScoutProfile["rating"],
  splits: { season: split(30, 110), last10: split(10, 111), last5: split(5, 115), home: split(15, 110), road: split(15, 110), neutral: split(0, null), top50: split(5, 110) },
  games: [],
  players: [],
  upcoming: [],
  metrics: {},
  ...patch,
});

describe("notebookRecentForm", () => {
  it("keeps season and last-five observations from one exact scouting edition", () => {
    const result = notebookRecentForm(profile("10"), profile("20"), "10", "20");
    expect(result).toEqual(expect.objectContaining({ sourceEdition: "edition-a", modelId: "model-a" }));
    expect(result?.home.season.metrics.off_eff).toBe(110);
    expect(result?.away.lastFive.metrics.off_eff).toBe(115);
  });

  it("preserves missing metric values without turning them into zero", () => {
    const home = profile("10");
    home.splits.last5.metrics.off_efg = { value: null, games: 5 };
    expect(notebookRecentForm(home, profile("20"), "10", "20")?.home.lastFive.metrics.off_efg).toBeNull();
  });

  it("withholds mixed identities, editions and invalid split values", () => {
    expect(notebookRecentForm(profile("10"), profile("20"), "99", "20")).toBeNull();
    expect(notebookRecentForm(profile("10"), profile("20", { source_edition: "edition-b" }), "10", "20")).toBeNull();
    expect(notebookRecentForm(profile("10"), profile("20", { model_id: "model-b" }), "10", "20")).toBeNull();
    expect(notebookRecentForm(profile("10"), profile("20", { generated_at: "2026-09-20T00:00:00Z" }), "10", "20")).toBeNull();
    const invalid = profile("10");
    invalid.splits.last5.metrics.off_eff = { value: Number.NaN, games: 5 };
    expect(notebookRecentForm(invalid, profile("20"), "10", "20")).toBeNull();
    const oversized = profile("10");
    oversized.splits.last5 = split(6, 110);
    expect(notebookRecentForm(oversized, profile("20"), "10", "20")).toBeNull();
  });
});
