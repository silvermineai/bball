import { describe, expect, it } from "vitest";
import { findNcaaTeamBoxRow, ncaaTeamBoxFilterSearch, parseNcaaTeamBoxFilters, sortNcaaTeamBox, sourceMetricEntries, teamBoxShotProfile, type NcaaTeamBoxEdition, type NcaaTeamBoxRow } from "./ncaa-team-box";
const row = (team: string, net_rtg: number): NcaaTeamBoxRow => ({ season: 2026, team_id: team, espn_team_id: null, team, games: 30, contests: 30, possessions: 2000, points: 2000, points_allowed: 1900, off_rtg: 110, def_rtg: 100, net_rtg, tempo: 70, efg_pct: .55, def_efg_pct: .48, ts_pct: .58, def_ts_pct: .5, to_rate_derived: .16, def_to_rate_derived: .18, orb_pct: .3, def_orb_pct: .7, ft_rate: .2, def_ft_rate: .18, three_rate: .4, def_three_rate: .35, net_rank: 1, source_totals: {}, source_averages: {} });
describe("NCAA team box archive filters", () => {
  it("round-trips a coaching slice", () => {
    const search = ncaaTeamBoxFilterSearch({ season: 2019, query: "Kansas", minGames: "20", sort: "efg_pct", direction: "asc" }, 2026);
    expect(search).toBe("?season=2019&q=Kansas&minGames=20&sort=efg_pct&direction=asc");
    expect(parseNcaaTeamBoxFilters(search, [2019, 2026], 2026)).toEqual({ season: 2019, query: "Kansas", minGames: "20", sort: "efg_pct", direction: "asc" });
  });
  it("sorts and rejects unsupported controls", () => {
    expect(sortNcaaTeamBox([row("Beta", 2), row("Alpha", 8)], "net_rtg", "desc").map((r) => r.team)).toEqual(["Alpha", "Beta"]);
    expect(parseNcaaTeamBoxFilters("?season=1900&minGames=999&sort=nope", [2019, 2026], 2026)).toEqual({ season: 2026, query: "", minGames: "10", sort: "net_rtg", direction: "desc" });
  });
  it("sorts retained true-shooting fields and preserves unavailable values", () => {
    const efficient = { ...row("Efficient", 4), ts_pct: .64, def_ts_pct: .47 };
    const average = { ...row("Average", 5), ts_pct: .56, def_ts_pct: .52 };
    const missing = { ...row("Missing", 6), ts_pct: null, def_ts_pct: null };
    expect(sortNcaaTeamBox([average, missing, efficient], "ts_pct", "desc").map((r) => r.team)).toEqual(["Efficient", "Average", "Missing"]);
    expect(sortNcaaTeamBox([average, missing, efficient], "def_ts_pct", "asc").map((r) => r.team)).toEqual(["Efficient", "Average", "Missing"]);
    expect(parseNcaaTeamBoxFilters("?sort=def_ts_pct&direction=asc", [2026], 2026).sort).toBe("def_ts_pct");
  });
  it("sorts every retained defensive Four Factor and leaves unavailable values last", () => {
    const alpha = row("Alpha", 8);
    const beta = { ...row("Beta", 2), def_to_rate_derived: .24, def_orb_pct: .22, def_ft_rate: .31 };
    const missing = { ...row("Missing", 4), def_to_rate_derived: null, def_orb_pct: null, def_ft_rate: null };
    expect(sortNcaaTeamBox([alpha, missing, beta], "def_to_rate_derived", "desc").map((r) => r.team)).toEqual(["Beta", "Alpha", "Missing"]);
    expect(sortNcaaTeamBox([alpha, missing, beta], "def_orb_pct", "asc").map((r) => r.team)).toEqual(["Beta", "Alpha", "Missing"]);
    expect(sortNcaaTeamBox([alpha, missing, beta], "def_ft_rate", "asc").map((r) => r.team)).toEqual(["Alpha", "Beta", "Missing"]);
    expect(parseNcaaTeamBoxFilters("?sort=def_efg_pct&direction=asc", [2026], 2026).sort).toBe("def_efg_pct");
  });
  it("keeps finite retained source aggregates and orders them for inspection", () => {
    expect(sourceMetricEntries({ z_total: 4, a_rate: 0, invalid: Number.NaN, missing: null as unknown as number }))
      .toEqual([["a_rate", 0], ["z_total", 4]]);
  });
  it("joins a dossier only through the exact retained ESPN team ID", () => {
    const edition = { teams: [{ ...row("Alpha", 8), espn_team_id: "150" }, { ...row("Beta", 2), espn_team_id: "2" }] } as NcaaTeamBoxEdition;
    expect(findNcaaTeamBoxRow(edition, "150")?.team).toBe("Alpha");
    expect(findNcaaTeamBoxRow(edition, "0150")).toBeNull();
  });
  it("projects source-average shot mix and accuracy without filling missing fields", () => {
    const profile = teamBoxShotProfile({
      ...row("Alpha", 8),
      source_averages: {
        rim_rate: .46, mid_rate: .11, tp_rate: .43, rim_pct: .64, mid_pct: .42, tpp: .35,
        d_rim_rate: .34, d_mid_rate: .21, d_tp_rate: .45, d_rim_pct: .55, d_mid_pct: .32,
        d_tpp: Number.NaN,
      },
    }, "edition-sha");
    expect(profile.source_edition).toBe("edition-sha");
    expect(profile.offense).toEqual({ rim_share: .46, mid_share: .11, three_share: .43, rim_pct: .64, mid_pct: .42, three_pct: .35 });
    expect(profile.defense.three_pct).toBeNull();
  });
});
