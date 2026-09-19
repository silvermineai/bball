import { describe, expect, it } from "vitest";
import { bundledNationalLeaderRows, metricValue, nationalLeaderCsvHeaders, nationalLeaderCsvRows, normalizeNationalLeader, resolveNationalLeaderResponse } from "./LiveNationalPlayerTable";

describe("live national player normalization", () => {
  it("uses live fields and fills the display line from the retained payload", () => {
    expect(normalizeNationalLeader({
      player_id: "42",
      name: "A Player",
      team_name: "A University",
      ppg: 21.5,
      publisher_rank: 3,
      payload: {
        conference: "Big Test",
        games: 30,
        rpg: 7.2,
        apg: 4.1,
        fg_pct: 52,
        three_pct: 39,
        ft_pct: 81,
        ppg_rank: 3,
      },
    })).toEqual({
      player_id: "42",
      division: 1,
      name: "A Player",
      team_name: "A University",
      conference: "Big Test",
      games: 30,
      ppg: 21.5,
      rpg: 7.2,
      apg: 4.1,
      spg: null,
      bpg: null,
      fouls: null,
      turnovers: null,
      fg_pct: 52,
      three_pct: 39,
      ft_pct: 81,
      ppg_rank: 3,
    });
  });

  it("drops rows without an exact player identity", () => {
    expect(normalizeNationalLeader({ name: "Unknown" })).toBeNull();
  });

  it("reads a selected rate without losing unavailable fields", () => {
    const player = normalizeNationalLeader({ player_id: "7", name: "A Center", bpg: 2.4 });
    expect(player).not.toBeNull();
    expect(metricValue(player!, "bpg")).toBe(2.4);
    expect(metricValue(player!, "ft_pct")).toBeNull();
  });

  it("exports the visible ranked rows with attached context and selected metric", () => {
    const player = normalizeNationalLeader({
      player_id: "42",
      name: "A Player",
      team_name: "A University",
      ppg: 21.5,
      publisher_rank: 2,
      payload: { conference: "Big Test", games: 30, rpg: 7.2, apg: 4.1, fouls: 60, turnovers: 45, fg_pct: 52, three_pct: 39, ft_pct: 81 },
    });
    expect(player).not.toBeNull();
    const row = nationalLeaderCsvRows([{ ...player!, leader_rank: 2 }], "ppg")[0];
    expect(row.slice(0, 6)).toEqual([2, "42", "A Player", "A University", "Big Test", 30]);
    expect(row[nationalLeaderCsvHeaders.indexOf("PF/G")]).toBe(2);
    expect(row[nationalLeaderCsvHeaders.indexOf("TO/G")]).toBe(1.5);
    expect(row[nationalLeaderCsvHeaders.indexOf("Selected metric")]).toBe("ppg");
    expect(row[nationalLeaderCsvHeaders.indexOf("Selected value")]).toBe(21.5);
  });

  it("uses bundled rows only for the unfiltered default leaderboard", () => {
    const initial = [normalizeNationalLeader({
      player_id: "42",
      name: "A Player",
      ppg: 21.5,
      publisher_rank: 2,
    })!];
    expect(bundledNationalLeaderRows(initial, "ppg", "")).toEqual([
      expect.objectContaining({ player_id: "42", leader_rank: 2 }),
    ]);
    expect(bundledNationalLeaderRows(initial, "ppg", "No Match")).toEqual([]);
    expect(bundledNationalLeaderRows(initial, "rpg", "")).toEqual([]);
  });

  it("treats a successful empty search as zero matches without fallback rows", () => {
    expect(resolveNationalLeaderResponse({ total: 0, rows: [] }, "ppg", "No Match")).toEqual({
      rows: [],
      total: 0,
      emptyMessage: "No Division I players match this search and field.",
    });
  });
});
