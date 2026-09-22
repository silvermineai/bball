import { describe, expect, it } from "vitest";
import { normalizeLiveRow } from "./DivisionPlayerRankings";
import { divisionRankingMetricGuide } from "../_lib/division-player-rankings";
import { divisionPlayerCsvHeaders, divisionPlayerCsvRows, validateDivisionPlayerExportPage } from "../_lib/division-player-export";

describe("live lower-division ranking rows", () => {
  it("keeps exact source identity, selected value, payload fields, and publisher rank", () => {
    const row = normalizeLiveRow({
      player_id: 10801980,
      division: 2,
      name: "Aidan McDowell",
      team_name: "Western Colo.",
      publisher_rank: 1,
      ppg: 26.7,
      payload: {
        games: 28,
        conference: "RMAC",
        source_stats: { ppg: { headers: ["Rank"], cells: ["1"], rank: 1, value: 26.7 } },
      },
    }, "ppg");

    expect(row).toMatchObject({
      player_id: "10801980",
      division: "2",
      name: "Aidan McDowell",
      team_name: "Western Colo.",
      games: 28,
      conference: "RMAC",
      ppg: 26.7,
      ppg_rank: 1,
    });
    expect(row.source_stats?.ppg?.rank).toBe(1);
  });

  it("explains rates, percentages, and totals without inventing a composite grade", () => {
    expect(divisionRankingMetricGuide("ppg")).toMatchObject({
      definition: expect.stringContaining("per-game rate"),
      denominator: expect.stringContaining("recorded games"),
    });
    expect(divisionRankingMetricGuide("fg_pct")).toMatchObject({
      definition: expect.stringContaining("shooting percentage"),
      denominator: expect.stringContaining("attempt denominator"),
    });
    expect(divisionRankingMetricGuide("pts")).toMatchObject({
      definition: expect.stringContaining("recorded source total"),
      interpretation: expect.stringContaining("games played"),
    });
  });

  it("exports every retained measure while preserving missing cells", () => {
    const row = normalizeLiveRow({ player_id: 7, division: 2, name: "Test Player", ppg: 12.5, payload: { games: 20, pts: 250 } }, "ppg");
    const ranked = { ...row, value: 12.5, rank: 1, source_rank: null };
    const values = divisionPlayerCsvRows([ranked], "ppg")[0];
    expect(divisionPlayerCsvHeaders).toContain("Points per game [ppg]");
    expect(values[0]).toBe(1);
    expect(values[10]).toBe(12.5);
    expect(values[divisionPlayerCsvHeaders.indexOf("Rebounds per game [rpg]")]).toBeNull();
  });

  it("rejects a changing or incomplete multi-page export", () => {
    expect(() => validateDivisionPlayerExportPage({ total: 2, limit: 40, rows: [{ player_id: 1 }] }, 2, 40, 0, 1)).not.toThrow();
    expect(() => validateDivisionPlayerExportPage({ total: 3, limit: 40, rows: [] }, 2, 40, 0, 1)).toThrow(/changed/);
    expect(() => validateDivisionPlayerExportPage({ total: 2, limit: 40, rows: [] }, 2, 40, 0, 2)).toThrow(/incomplete/);
  });

  it("fails closed when an export page crosses the requested division or loses identity", () => {
    const page = { total: 2, limit: 40, rows: [
      { player_id: 1, division: 2 },
      { player_id: 2, division: 3 },
    ] };
    expect(() => validateDivisionPlayerExportPage(page, 2, 40, 0, 1, "2")).toThrow(/outside the requested division/);
    expect(() => validateDivisionPlayerExportPage({ total: 1, limit: 40, rows: [{ division: 2 }] }, 1, 40, 0, 1, "2")).toThrow(/without a player identity/);
    expect(() => validateDivisionPlayerExportPage({ total: 1, limit: 40, rows: [{ player_id: "1", division: 2 }] }, 1, 40, 0, 1, "2")).not.toThrow();
  });
});
