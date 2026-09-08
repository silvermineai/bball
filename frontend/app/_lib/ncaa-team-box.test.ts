import { describe, expect, it } from "vitest";
import { ncaaTeamBoxFilterSearch, parseNcaaTeamBoxFilters, sortNcaaTeamBox, type NcaaTeamBoxRow } from "./ncaa-team-box";
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
});
